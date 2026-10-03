export function sessionCookieName(): string {
  return process.env.NODE_ENV === 'production' ? '__Host-fe_session' : 'fe_session';
}

export function sessionCookieOptions(maxAge?: number): Record<string, unknown> {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    ...(maxAge === undefined ? {} : { maxAge }),
  };
}
