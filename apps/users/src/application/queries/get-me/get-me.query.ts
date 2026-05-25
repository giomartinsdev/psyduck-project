import { IncomingHttpHeaders } from 'node:http';

export class GetMeQuery {
  constructor(public readonly headers: IncomingHttpHeaders) {}
}
