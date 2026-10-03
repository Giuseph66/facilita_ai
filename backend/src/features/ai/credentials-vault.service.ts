import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { fail } from '../../core/errors';

export interface EncryptedCredential {
  ciphertext: Buffer;
  nonce: Buffer;
  authTag: Buffer;
  keyVersion: string;
  maskedSuffix: string;
}

@Injectable()
export class CredentialsVaultService {
  encrypt(userId: string, connectionId: string, provider: string, apiKey: string): EncryptedCredential {
    const { id, key } = this.activeKey();
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(Buffer.from(`${connectionId}:${userId}:${provider}`));
    const ciphertext = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
    return {
      ciphertext,
      nonce,
      authTag: cipher.getAuthTag(),
      keyVersion: id,
      maskedSuffix: `••••${apiKey.slice(-4)}`,
    };
  }

  decrypt(
    userId: string,
    connectionId: string,
    provider: string,
    credential: { ciphertext: Buffer; nonce: Buffer; auth_tag: Buffer; key_version: string },
  ): string {
    const key = this.keyById(credential.key_version);
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, credential.nonce);
      decipher.setAAD(Buffer.from(`${connectionId}:${userId}:${provider}`));
      decipher.setAuthTag(credential.auth_tag);
      return Buffer.concat([decipher.update(credential.ciphertext), decipher.final()]).toString('utf8');
    } catch {
      fail(503, 'CREDENTIAL_UNAVAILABLE', 'A conexão de IA precisa ser configurada novamente.');
    }
  }

  private activeKey(): { id: string; key: Buffer } {
    const id = process.env.VAULT_ACTIVE_KEY_ID;
    if (!id) fail(503, 'VAULT_NOT_CONFIGURED', 'O cofre de credenciais não está configurado.');
    return { id, key: this.keyById(id) };
  }

  private keyById(id: string): Buffer {
    try {
      const configured = JSON.parse(process.env.VAULT_KEYS_JSON ?? '{}') as Record<string, string>;
      const encoded = configured[id];
      if (!encoded) throw new Error('missing key');
      const key = Buffer.from(encoded, 'base64');
      if (key.length !== 32) throw new Error('invalid key length');
      return key;
    } catch {
      fail(503, 'VAULT_NOT_CONFIGURED', 'O cofre de credenciais não está configurado.');
    }
  }
}
