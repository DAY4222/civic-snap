import {
  isSignedInUserRequired,
  readSignedInUserId,
  resolveCallerIdentity,
} from '../../supabase/functions/_shared/identity';

function token(payload: Record<string, unknown>) {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`;
}

const USER_ID = '3f1c2b9e-7a43-4c55-9d2e-1b0a6f2c8d11';

describe('Edge Function caller identity', () => {
  it('reads the user id from a signed-in user token, anonymous users included', () => {
    expect(
      readSignedInUserId(`Bearer ${token({ role: 'authenticated', sub: USER_ID, is_anonymous: true })}`)
    ).toBe(USER_ID);
  });

  it('ignores the anon key and anything it cannot read', () => {
    expect(readSignedInUserId(`Bearer ${token({ role: 'anon', iss: 'supabase' })}`)).toBeNull();
    expect(readSignedInUserId(`Bearer ${token({ role: 'authenticated' })}`)).toBeNull();
    expect(readSignedInUserId('Bearer not-a-jwt')).toBeNull();
    expect(readSignedInUserId('Bearer a.%%%.c')).toBeNull();
    expect(readSignedInUserId('Basic abc')).toBeNull();
    expect(readSignedInUserId(null)).toBeNull();
  });

  it('counts a signed-in user as one caller, and falls back to the install id', () => {
    expect(
      resolveCallerIdentity(`Bearer ${token({ role: 'authenticated', sub: USER_ID })}`, 'install-1')
    ).toEqual({ kind: 'user', key: `user:${USER_ID}` });
    expect(resolveCallerIdentity(`Bearer ${token({ role: 'anon' })}`, 'install-1')).toEqual({
      kind: 'install',
      key: 'install-1',
    });
  });

  it('only requires a user token when the switch is set', () => {
    expect(isSignedInUserRequired(() => undefined)).toBe(false);
    expect(isSignedInUserRequired(() => 'false')).toBe(false);
    expect(isSignedInUserRequired(() => ' TRUE ')).toBe(true);
  });
});
