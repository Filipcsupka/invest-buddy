import { hashPassword, verifyPassword } from "better-auth/crypto";

const common = new Set(["password", "password123", "1234567890", "123456789", "qwerty123", "qwertyuiop", "letmein123", "iloveyou", "admin12345", "welcome123", "password1", "123123123", "0000000000", "abc1234567", "changeme123"]);

export function validPassword(password: unknown): password is string {
  return typeof password === "string" && password.length >= 10 && password.length <= 128 && !common.has(password.toLowerCase());
}

export { hashPassword, verifyPassword };
