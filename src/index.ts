import express from 'express';
import cors from 'cors';
import type { RequestHandler, Request, Response } from "express";
import type { Result } from 'monadix/result';
import type { ZodIssue, ZodType } from "zod";

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

interface Validation {
  bodySchema?: ZodType<unknown>;
  querySchema?: ZodType<unknown>;
  paramsSchema?: ZodType<unknown>;
}

interface EndpointDefinition<Data> {
  resourceType: string;
  validation?: Validation;
  handler: (
    req: Request, res: Response,
  ) => (
    | Result<EndpointResult<Data>, EndpointError | EndpointError[]>
    | Promise<Result<EndpointResult<Data>, EndpointError | EndpointError[]>>
  );
}

export interface Jsonder {
  middleware: () => RequestHandler;
  endpoint: <Data>(definition: EndpointDefinition<Data>) => RequestHandler;
  sendSuccess: (res: Response, result: EndpointResult<unknown>) => void;
  sendFail: (res: Response, error: EndpointError | EndpointError[]) => void;
}

interface JsonderOptions {
  generateUrls?: {
    serverUrl: string;
  };
}

const issuesToErrors = (
  issues: ZodIssue[],
  location: 'body' | 'query' | 'params',
): EndpointError[] => issues.map(({ code, message, ...meta }) => ({
  status: 400,
  code,
  detail: message,
  meta: {
    location,
    ...meta,
  }
}));

const jsonder = (options?: JsonderOptions): Jsonder => {
  return {
    middleware() {
      const router = express.Router();
      router.use(express.json());
      router.use(cors());
      return router;
    },

    endpoint<Data>(definition: EndpointDefinition<Data>) {
      const { resourceType: type, validation, handler } = definition;
      
      return async (req: Request, res: Response) => {
        const bodyValidation = validation?.bodySchema?.safeParse(req.body) ?? { success: true };
        const queryValidation = validation?.querySchema?.safeParse(req.query) ?? { success: true };
        const paramsValidation = validation?.paramsSchema?.safeParse(req.params) ?? { success: true };

        const errors = [];

        if (!bodyValidation.success) {
          errors.push(...issuesToErrors(bodyValidation.error.issues, 'body'));
        }

        if (!queryValidation.success) {
          errors.push(...issuesToErrors(queryValidation.error.issues, 'query'));
        }

        if (!paramsValidation.success) {
          errors.push(...issuesToErrors(paramsValidation.error.issues, 'params'));
        }

        if (errors.length > 0) {
          this.sendFail(res, errors);
          return;
        }

        const result = await handler(req, res);
        result
          .map((eResult) => this.sendSuccess(res, eResult))
          .orElse((errors) => this.sendFail(res, errors));
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
