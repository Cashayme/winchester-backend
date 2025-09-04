import { Session, SessionData } from "express-session";

declare module "express-serve-static-core" {
  interface Request {
    body?: any;
    session?: Session & Partial<SessionData>;
    headers: any;
  }
}
