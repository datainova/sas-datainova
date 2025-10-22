import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3333';

export const httpClient = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 10_000
});

httpClient.interceptors.request.use((config) => {
  const correlationId = window.crypto?.randomUUID?.() ?? Date.now().toString();
  config.headers.set('x-correlation-id', correlationId);
  return config;
});

type UnauthorizedHandler = (error: AxiosError) => Promise<unknown>;
let unauthorizedHandler: UnauthorizedHandler | undefined;

const shouldSkipUnauthorizedRetry = (config?: InternalAxiosRequestConfig) => {
  if (!config) return true;
  if (config.headers?.['x-skip-refresh'] === 'true') return true;
  return false;
};

export const setUnauthorizedHandler = (handler: UnauthorizedHandler | undefined) => {
  unauthorizedHandler = handler;
};

type TenantContextHeaders = {
  token?: string;
  orgId?: string;
  tenantId?: string;
  userId?: string;
  roles?: string[];
  plan?: string;
};

export const setTenantContextHeaders = (context: TenantContextHeaders | null) => {
  if (!context) {
    delete httpClient.defaults.headers.common.authorization;
    delete httpClient.defaults.headers.common['x-org-id'];
    delete httpClient.defaults.headers.common['x-tenant-id'];
    delete httpClient.defaults.headers.common['x-user-id'];
    delete httpClient.defaults.headers.common['x-roles'];
    delete httpClient.defaults.headers.common['x-plan'];
    return;
  }

  if (context.token) {
    httpClient.defaults.headers.common.authorization = `Bearer ${context.token}`;
  } else {
    delete httpClient.defaults.headers.common.authorization;
  }

  const headerMap: Array<[string, string | undefined]> = [
    ['x-org-id', context.orgId],
    ['x-tenant-id', context.tenantId],
    ['x-user-id', context.userId],
    ['x-roles', context.roles?.join(',')],
    ['x-plan', context.plan]
  ];

  for (const [header, value] of headerMap) {
    if (value) {
      httpClient.defaults.headers.common[header] = value;
    } else {
      delete httpClient.defaults.headers.common[header];
    }
  }
};

httpClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401 && !shouldSkipUnauthorizedRetry(error.config) && unauthorizedHandler) {
      return unauthorizedHandler(error);
    }
    return Promise.reject(error);
  }
);
