import { describe, expect, it } from 'vitest';
import type { AuthorizedSource } from '../../src/features/rag/rag.service';
import { StudyService } from '../../src/features/study/study.service';

const service = Object.create(StudyService.prototype) as {
  parseOutput(kind: 'SUMMARY', text: string): Record<string, unknown>;
  resolveSummarySources(payload: Record<string, unknown>, sources: AuthorizedSource[]): Record<string, unknown>;
};
const output = {
  title: 'Modelo BDI', summary: 'Visão geral.', keyPoints: ['Crenças podem estar erradas.'],
  sections: [{ title: 'Ciclo', content: 'Crenças e desejos alimentam a deliberação.', sourceIds: ['SOURCE_1', 'SOURCE_2'] }],
};
const sources = [
  { documentId: 'document-a', documentName: 'Aula.pdf', pageNumber: 22 },
  { documentId: 'document-a', documentName: 'Aula.pdf', pageNumber: 22 },
] as AuthorizedSource[];

describe('resumo com referências por seção', () => {
  it('resolve referências exclusivamente pelo corpus fornecido e agrupa trechos da mesma página', () => {
    const parsed = service.parseOutput('SUMMARY', JSON.stringify(output));
    const result = service.resolveSummarySources(parsed, sources);
    expect(result.sections).toEqual([{
      title: 'Ciclo', content: 'Crenças e desejos alimentam a deliberação.',
      sources: [{ documentId: 'document-a', documentName: 'Aula.pdf', pageNumber: 22 }],
    }]);
  });

  it('recusa referência que o modelo inventou fora do contexto autorizado', () => {
    const parsed = service.parseOutput('SUMMARY', JSON.stringify({ ...output,
      sections: [{ ...output.sections[0], sourceIds: ['SOURCE_99'] }],
    }));
    expect(() => service.resolveSummarySources(parsed, sources)).toThrow(expect.objectContaining({ code: 'AI_OUTPUT_INVALID' }));
  });

  it('exige explicação e referências para novas gerações de resumo', () => {
    expect(() => service.parseOutput('SUMMARY', JSON.stringify({ ...output, sections: [] }))).toThrow();
    expect(() => service.parseOutput('SUMMARY', JSON.stringify({ ...output,
      sections: [{ ...output.sections[0], sourceIds: [] }],
    }))).toThrow();
  });

  it('recusa URLs no campo de referências produzido pelo modelo', () => {
    expect(() => service.parseOutput('SUMMARY', JSON.stringify({ ...output,
      sections: [{ ...output.sections[0], sourceIds: ['https://example.test/material-privado'] }],
    }))).toThrow();
  });
});
