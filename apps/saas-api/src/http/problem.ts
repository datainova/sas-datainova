import { STATUS_CODES } from "http";
import { FastifyReply, FastifyRequest } from "fastify";

interface ProblemDetails {
  status: number;
  code: string;
  title?: string;
  detail: string;
  type?: string;
  instance?: string;
  context?: Record<string, unknown>;
}

export const sendProblem = (
  reply: FastifyReply,
  request: FastifyRequest,
  problem: ProblemDetails
) => {
  const title =
    problem.title ?? STATUS_CODES[problem.status] ?? "Unexpected Error";
  const type = problem.type ?? `https://errors.datainova.com/${problem.code}`;

  const payload = {
    type,
    title,
    status: problem.status,
    detail: problem.detail,
    instance: problem.instance ?? request.url,
    code: problem.code,
    correlation: {
      request_id: request.id,
      trace_id: request.headers["traceparent"] ?? null,
    },
    context: problem.context ?? undefined,
  };

  reply.header("x-request-id", request.id);
  if (request.headers["traceparent"]) {
    reply.header("traceparent", request.headers["traceparent"] as string);
  }

  return reply
    .status(problem.status)
    .type("application/problem+json")
    .send(payload);
};
