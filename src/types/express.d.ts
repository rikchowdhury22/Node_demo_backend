export {};

declare global {
  namespace Express {
    interface UserPayload {
      _id: string;
      orgId: string;
    }

    interface Request {
      user: UserPayload;
    }
  }
}