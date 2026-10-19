import { Logger, JwtService } from "../common";
import { RedisClient } from "../common/redis/client";
import { Config } from ".";

export const logger = new Logger({
  level: Config.logging.level,
  service: Config.service.name,
});

export const jwt = new JwtService(Config.jwt.secret, Config.jwt.expiresIn);

export const redis = new RedisClient({
  keyPrefix: Config.redis.keyPrefix || "printloop",
  ttl: Config.redis.ttl,
});
