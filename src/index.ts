import express from 'express';
import cors from 'cors';
import type { RequestHandler, Request, Response } from "express";
import type { Result } from 'monadix/result';
import type { ZodType } from "zod";

export interface EndpointError<M extends Record<string, any> = Record<string, any>> {
  status: number;
  code: string;
  detail: string;
  meta?: M;
}

type Resource<T> = {
  id: string;
} & T;

type EndpointResult<T> = Resource<T> | Resource<T>[];

interface EndpointDefinition<Body, Data> {
  resourceType: string;
  bodySchema?: ZodType<Body>;
  handler: (
    req: Request, res: Response,
  ) => (
    | Result<EndpointResult<Data>, EndpointError[]>
    | Promise<Result<EndpointResult<Data>, EndpointError[]>>
  );
}

interface Jsonder {
  middleware: () => RequestHandler;
  endpoint: <Body, Data>(definition: EndpointDefinition<Body, Data>) => RequestHandler;
  sendSuccess: (res: Response, result: EndpointResult<unknown>) => void;
  sendFail: (res: Response, errors: EndpointError[]) => void;
}

interface JsonderOptions {
  serverUrl: string;
}

const jsonder = (options: JsonderOptions): Jsonder => {
  return {
    middleware() {
      const router = express.Router();
      router.use(express.json());
      router.use(cors());
      return router;
    },

    endpoint<Body, Data>(definition: EndpointDefinition<Body, Data>) {
      const { resourceType: type, bodySchema: validation, handler } = definition;
      
      return async (req: Request, res: Response) => {
        const validationResult = validation?.safeParse(req.body) ?? { success: true };
        if (!validationResult.success) {
          this.sendFail(res, validationResult.error.issues.map(({ code, message, ...meta }) => ({
            status: 400,
            code,
            detail: message,
            meta,
          })));

          return;
        }

        const result = await handler(req, res);
        result
          .map((eResult) => this.sendSuccess(res, eResult))
          .mapErr((errors) => this.sendFail(res, errors));
        };
    },

    sendSuccess: (res: Response, result: EndpointResult<unknown>) => {
      res.json({
        status: 'success',
        result: Array.isArray(result)
          ? result.map((item) => ({
            ...item,
            url: `${options.serverUrl}${res.req.originalUrl}/${item.id}`,
          }))
          : {
            ...result,
            url: `${options.serverUrl}${res.req.originalUrl}`,
          },
      });
    },

    sendFail: (res: Response, errors: EndpointError[]) => {
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
  }
};

export default jsonder;
