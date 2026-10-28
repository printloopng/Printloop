import { Config } from '@/config';
import jwt, { SignOptions } from "jsonwebtoken";
import { UnauthorizedError } from "../errors";
import { Logger } from "../logger";
import { UserPayload, DecodedToken } from "../types";

export class JwtService {
  private readonly jwtLog = new Logger({
    level: Config.logging.level,
    service: "jwt-service",
  });
  private readonly secret: string;
  private readonly expiresIn: string;

  constructor(secret: string, expiresIn: string = "7d") {
    if (!secret || secret.length < 16) {
      throw new Error("JWT secret must be at least 16 characters");
    }
    this.secret = secret;
    this.expiresIn = expiresIn;
  }

  sign<T extends UserPayload>(payload: T, expiresIn: string = this.expiresIn): string {
    try {
      const options: SignOptions = {
        expiresIn: expiresIn as SignOptions["expiresIn"],
      };
      return jwt.sign(payload as object, this.secret, options);
    } catch (error) {
      this.jwtLog.error(
        "JWT sign error",
        error instanceof Error ? error : new Error(String(error)),
      );
      throw new UnauthorizedError("Failed to sign JWT token");
    }
  }

  verify<T extends UserPayload>(token: string): DecodedToken<T> {
    try {
      return jwt.verify(token, this.secret) as DecodedToken<T>;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError("Token has expired");
      }
      throw new UnauthorizedError("Invalid token");
    }
  }
}
