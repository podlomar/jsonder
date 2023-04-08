import express from 'express';
import cors from 'cors';
import type { RequestHandler, Request, Response } from "express";
import type { Result } from 'monadix/result';
import type { ZodType } from "zod";

export interface ResultError<M extends Record<string, any> = Record<string, any>> {
  status: number;
  code: string;
  detail: string;
  meta?: M;
}

interface ResouceDefinition<T> {
  type: string;
  validation?: ZodType<T>;
  handler: (
    req: Request, res: Response,
  ) => Result<T, ResultError[]> | Promise<Result<T, ResultError[]>>;
}

interface Jsonder {
  middleware: () => RequestHandler;
  resource: <T>(definition: ResouceDefinition<T>) => RequestHandler;
}

interface JsonderOptions {
  serverUrl: string;
}

const sendFail = (res: Response, errors: ResultError[]) => {
  const status = errors.length === 1
    ? errors[0].status
    : errors
      .map((error) => Math.floor(error.status / 100))
      .reduce((acc, cur) => (cur > acc ? cur : acc), 0) * 100;
  
  res.status(status).json({
    status: 'fail',
    errors,
  });
}

const jsonder = (options: JsonderOptions): Jsonder => {
  return {
    middleware: () => {
      const router = express.Router();
      router.use(express.json());
      router.use(cors());
      return router;
    },
    resource: <T>(definition: ResouceDefinition<T>) => {
      const { type, validation, handler } = definition;
      
      return async (req: Request, res: Response) => {
        const validationResult = validation?.safeParse(req.body) ?? { success: true };
        if (!validationResult.success) {
          sendFail(res, validationResult.error.issues.map(({ code, message, ...meta }) => ({
            status: 400,
            code,
            detail: message,
            meta,
          })));

          return;
        }

        const result = await handler(req, res);
        result
          .map((data) => res.status(200).json({
            status: 'success',
            type,
            url: `${options.serverUrl}${req.originalUrl}`,
            result: data,
          }))
          .mapErr((errors) => sendFail(res, errors));
        };
    }
  }
};

export default jsonder;
