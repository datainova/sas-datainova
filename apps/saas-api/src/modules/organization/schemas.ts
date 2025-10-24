import { z } from "zod";

export const organizationNicknameSchema = z
  .string()
  .trim()
  .min(3, { message: "Nickname must have at least 3 characters." })
  .max(50, { message: "Nickname must have at most 50 characters." })
  .regex(/^[\p{L}\p{N}][\p{L}\p{N}\s_-]*[\p{L}\p{N}]$/u, {
    message:
      "Nickname must start and end with a letter or number and may include spaces, hyphens or underscores.",
  })
  .transform((value) => value.replace(/\s{2,}/g, " "))
  .describe(
    "Apelido opcional e único para identificar a organização durante o login."
  );
