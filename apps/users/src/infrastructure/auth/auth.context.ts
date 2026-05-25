import { JwtService } from './jwt.service';

export function buildContext(
  authHeader: string,
  jwtService: JwtService,
): { userId?: string; userEmail?: string } {
  if (!authHeader.startsWith('Bearer ')) return {};
  const token = authHeader.slice(7);
  const payload = jwtService.verify(token);
  if (!payload) return {};
  return { userId: payload.sub, userEmail: payload.email };
}
