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
    | Result<EndpointResult<Data>, EndpointError | EndpointError[]>
    | Promise<Result<EndpointResult<Data>, EndpointError | EndpointError[]>>
  );
}

export interface Jsonder {
  middleware: () => RequestHandler;
  endpoint: <Body, Data>(definition: EndpointDefinition<Body, Data>) => RequestHandler;
  sendSuccess: (res: Response, result: EndpointResult<unknown>) => void;
  sendFail: (res: Response, error: EndpointError | EndpointError[]) => void;
}

interface JsonderOptions {
  generateUrls?: {
    serverUrl: string;
  };
}

const jsonder = (options?: JsonderOptions): Jsonder => {
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
      const generateUrls = options?.generateUrls;
      
      res.json({
        status: 'success',
        result: Array.isArray(result)
          ? result.map((item) => ({
            ...item,
            url: generateUrls === undefined
              ? undefined
              : `${generateUrls.serverUrl}${res.req.originalUrl}/${item.id}`,
          }))
          : {
            ...result,
            url: generateUrls === undefined
              ? undefined
              : `${generateUrls.serverUrl}${res.req.originalUrl}`,
          },
      });
    },

    sendFail: (res: Response, error: EndpointError | EndpointError[]) => {
      const status = !Array.isArray(error)
        ? error.status
        : error.length === 1
          ? error[0].status
          : error
            .map((e) => Math.floor(e.status / 100))
            .reduce((acc, cur) => (cur > acc ? cur : acc), 0) * 100;
      
      res.status(status).json({
        status: 'fail',
        errors: Array.isArray(error) ? error : [error],
      });
    }
  }
};

export default jsonder;
