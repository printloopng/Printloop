import { AppDataSource } from "@/config/data-source";
import { JwtService } from "../auth/jwt";
import { UserPayload } from "../types";
import { UnauthorizedError } from "../errors";

export interface LoadedAuthContext {
  user: any;
  token: string;
  exp: number;
  payload: UserPayload;
}

export async function loadAuthenticatedUserContext(
  jwtService: JwtService,
  token: string,
): Promise<LoadedAuthContext> {
  const decoded = jwtService.verify<UserPayload>(token);
  if (typeof decoded.userId !== "string" || !decoded.userId || (decoded as any).kind || (decoded as any).scope) {
    throw new UnauthorizedError("Invalid token");
  }

  const userRepository = AppDataSource.getRepository("User" as any);
  const user = await userRepository.findOne({
    where: { id: decoded.userId } as any,
  });

  if (!user) {
    throw new UnauthorizedError("Invalid token");
  }

  return {
    user,
    token,
    exp: decoded.exp,
    payload: decoded,
  };
}
