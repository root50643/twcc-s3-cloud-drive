import { Router } from "express";
import { z } from "zod";
import type { UserStore } from "../auth/userStore.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/errors.js";

const loginSchema = z.object({
  username: z.string().min(1).max(128),
  password: z.string().min(1).max(512)
});

export function createAuthRouter(userStore: UserStore): Router {
  const router = Router();

  router.post("/login", async (req, res, next) => {
    try {
      const body = loginSchema.safeParse(req.body);
      if (!body.success) {
        throw new HttpError(400, "INVALID_LOGIN_REQUEST", "Username and password are required.");
      }

      const user = await userStore.verify(body.data.username, body.data.password);
      if (!user) {
        throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid username or password.");
      }

      req.session.user = user;
      res.json({ user });
    } catch (error) {
      next(error);
    }
  });

  router.post("/logout", requireAuth, (req, res, next) => {
    req.session.destroy((error) => {
      if (error) {
        next(error);
        return;
      }
      res.clearCookie("sid");
      res.status(204).send();
    });
  });

  router.get("/me", requireAuth, (req, res) => {
    res.json({ user: req.session.user });
  });

  return router;
}
