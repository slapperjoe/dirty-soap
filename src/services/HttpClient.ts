/**
 * HttpClient - Unified HTTP client for REST, GraphQL, and SOAP requests
 * Part of Apinox Phase 2: Backend Changes
 */

import * as os from 'os';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import {
  ApiRequest,
  BodyType,
  HttpMethod,
  RestConfig,
} from "../../shared/src/models";
import { SettingsManager } from "../utils/SettingsManager";
import * as NativeHttpClient from "../utils/NativeHttpClient";

export interface HttpResponse {
  success: boolean;
  status?: number;
  headers?: Record<string, any>;
  rawResponse: string | null;
  rawRequest: string;
  timeTaken: number;
  error?: string;
  result?: any;
}

export interface HttpClientOptions {
  timeout?: number;
  followRedirects?: boolean;
}

export class HttpClient {
  private abortController: AbortController | null = null;
  private settingsManager: SettingsManager;
  private outputChannel: any;

  constructor(settingsManager: SettingsManager, outputChannel?: any) {
    this.settingsManager = settingsManager;
    this.outputChannel = outputChannel;
  }

  private log(message: string, data?: any): void {
    if (this.outputChannel) {
      this.outputChannel.appendLine(`[HttpClient] ${message}`);
      if (data !== undefined) {
        this.outputChannel.appendLine(JSON.stringify(data, null, 2));
      }
    }
  }

  /**
   * Execute a request based on its type
   */
  async execute(
    request: ApiRequest,
    options?: HttpClientOptions,
  ): Promise<HttpResponse> {
    const requestType = request.requestType || "soap";

    switch (requestType) {
      case "graphql":
        return this.executeGraphQL(request, options);
      case "rest":
        return this.executeRest(request, options);
      case "soap":
      default:
        return this.executeSoap(request, options);
    }
  }

  /**
   * Execute a REST request
   */
  async executeRest(
    request: ApiRequest,
    options?: HttpClientOptions,
  ): Promise<HttpResponse> {
    const method = (request.method || "GET") as HttpMethod;
    let endpoint = request.endpoint || "";
    const bodyType = request.bodyType || "json";

    // Apply path parameters
    if (request.restConfig?.pathParams) {
      for (const [key, value] of Object.entries(
        request.restConfig.pathParams,
      )) {
        endpoint = endpoint.replace(`{${key}}`, encodeURIComponent(value));
        endpoint = endpoint.replace(`:${key}`, encodeURIComponent(value));
      }
    }

    // Build query string
    if (request.restConfig?.queryParams) {
      const params = new URLSearchParams(request.restConfig.queryParams);
      const separator = endpoint.includes("?") ? "&" : "?";
      endpoint = endpoint + separator + params.toString();
    }

    // Prepare headers
    const headers: Record<string, string> = {
      ...request.headers,
    };

    // Set content type based on body type
    if (!headers["Content-Type"]) {
      headers["Content-Type"] = this.getContentType(bodyType);
    }

    // Apply auth
    this.applyAuth(headers, request.restConfig);

    // Determine if we need a body
    const hasBody = ["POST", "PUT", "PATCH"].includes(method);
    const body = hasBody ? request.request : undefined;

    return this.sendRequest(method, endpoint, body, headers, options);
  }

  /**
   * Execute a GraphQL request
   */
  async executeGraphQL(
    request: ApiRequest,
    options?: HttpClientOptions,
  ): Promise<HttpResponse> {
    const endpoint = request.endpoint || "";

    // Build GraphQL body
    const graphqlBody = {
      query: request.request,
      variables: request.graphqlConfig?.variables || {},
      operationName: request.graphqlConfig?.operationName,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...request.headers,
    };

    // Apply auth if present
    this.applyAuth(headers, request.restConfig);

    const jsonBody = JSON.stringify(graphqlBody);
    this.log("[HttpClient] executeGraphQL Body: " + jsonBody);

    return this.sendRequest("POST", endpoint, jsonBody, headers, options);
  }

  /**
   * Execute a SOAP request (delegates to existing logic pattern)
   */
  async executeSoap(
    request: ApiRequest,
    options?: HttpClientOptions,
  ): Promise<HttpResponse> {
    const endpoint = request.endpoint || "";
    const headers: Record<string, string> = {
      "Content-Type": request.contentType || "text/xml;charset=UTF-8",
      ...request.headers,
    };

    const fs = require("fs");
    try {
      const debugPath = path.join(os.tmpdir(), 'dirty_debug.txt');
      fs.appendFileSync(
        debugPath,
        `\n[${new Date().toISOString()}] Sending POST to ${endpoint}\nBody: ${typeof request.request === "string" ? request.request : JSON.stringify(request.request)}\nHeaders: ${JSON.stringify(headers)}\n`,
      );
    } catch (e) {
      /* ignore */
    }

    return this.sendRequest(
      "POST",
      endpoint,
      request.request,
      headers,
      options,
    );
  }

  /**
   * Cancel the current request
   */
  cancelRequest(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Core HTTP send method
   */
  private async sendRequest(
    method: HttpMethod | string,
    endpoint: string,
    body: any,
    headers: Record<string, string>,
    options?: HttpClientOptions,
  ): Promise<HttpResponse> {
    const formattedRequestBody = this.formatBodyForLog(body);

    if (!endpoint) {
      return {
        success: false,
        error: "Invalid URL: Endpoint is missing",
        rawResponse: null,
        rawRequest: formattedRequestBody,
        timeTaken: 0,
      };
    }

    this.abortController = new AbortController();

    const { proxyUrl, strictSSL } = this.getProxySettings();
    const agents = this.createAgents(endpoint, proxyUrl, strictSSL);

    let requestHeaders: Record<string, string> = { ...headers };
    if (body && typeof (body as any).getHeaders === "function") {
      requestHeaders = { ...requestHeaders, ...(body as any).getHeaders() };
    }

    this.log(`${method} ${endpoint}`);
    this.log("Headers:", requestHeaders);
    if (formattedRequestBody) {
      this.log("Body:", formattedRequestBody);
      this.log("[HttpClient] sendRequest Body: " + formattedRequestBody);
    }
    this.log(
      "[HttpClient] sendRequest Headers: " + JSON.stringify(requestHeaders),
    );

    const startTime = Date.now();

    try {
      // Use native fetch with custom agents if needed
      const fetchOptions: RequestInit & { agent?: any } = {
        method: method.toUpperCase(),
        headers: requestHeaders,
        body: body,
        signal: this.abortController.signal,
      };

      // Add agents for proxy support (Node.js fetch supports agent option)
      if (agents.httpsAgent || agents.httpAgent) {
        (fetchOptions as any).agent = endpoint.toLowerCase().startsWith('https')
          ? agents.httpsAgent
          : agents.httpAgent;
      }

      const controller = new AbortController();
      // Use configured timeout from settings, fallback to passed option, then default 30s
      const configuredTimeout = this.settingsManager.getConfig().network?.defaultTimeout;
      const timeoutMs = options?.timeout || (configuredTimeout ? configuredTimeout * 1000 : 30000);
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      // Combine both abort signals (manual cancel + timeout)
      const combinedSignal = this.combineAbortSignals(
        this.abortController.signal,
        controller.signal
      );
      fetchOptions.signal = combinedSignal;

      const response = await fetch(endpoint, fetchOptions);
      clearTimeout(timeoutId);

      const responseData = await response.text();
      const timeTaken = Date.now() - startTime;

      // Convert Headers to plain object
      const responseHeaders: Record<string, any> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      this.log("Response Status:", response.status);
      this.log("Response Body:", responseData);

      this.abortController = null;

      return {
        success: response.status >= 200 && response.status < 400,
        status: response.status,
        headers: responseHeaders,
        rawResponse: responseData,
        rawRequest: formattedRequestBody,
        timeTaken,
      };
    } catch (error: any) {
      const timeTaken = Date.now() - startTime;
      this.abortController = null;

      if (error.name === 'AbortError') {
        this.log("Request canceled by user");
        return {
          success: false,
          error: "Request Canceled",
          rawResponse: null,
          rawRequest: formattedRequestBody,
          timeTaken,
        };
      }

      this.log("Request failed:", error.message);

      return {
        success: false,
        error: error.message,
        rawResponse: null,
        rawRequest: formattedRequestBody,
        timeTaken,
      };
    }
  }

  /**
   * Combine multiple AbortSignals into one
   */
  private combineAbortSignals(...signals: AbortSignal[]): AbortSignal {
    const controller = new AbortController();
    
    for (const signal of signals) {
      if (signal.aborted) {
        controller.abort();
        break;
      }
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    
    return controller.signal;
  }

  /**
   * Get proxy settings from SettingsManager
   */
  private getProxySettings(): {
    proxyUrl: string | undefined;
    strictSSL: boolean;
  } {
    const config = this.settingsManager.getConfig();
    return {
      proxyUrl: config?.network?.proxy,
      strictSSL: config?.network?.strictSSL !== false,
    };
  }

  /**
   * Create HTTP/HTTPS agents with proxy support
   */
  private createAgents(endpoint: string, proxyUrl?: string, strictSSL = true) {
    if (!proxyUrl) {
      // If no proxy, let axios use its default agents (which handles global settings correctly)
      // This avoids issues with manually created agents in VS Code/Electron environment
      return { httpsAgent: undefined, httpAgent: undefined };
    }

    const agentOptions: any = {
      keepAlive: false,
      rejectUnauthorized: strictSSL,
    };
    const isHttps = endpoint.toLowerCase().startsWith("https");

    let httpsAgent: any;
    let httpAgent: any;

    if (proxyUrl) {
      const { HttpsProxyAgent } = require("https-proxy-agent");

      if (isHttps) {
        httpsAgent = new HttpsProxyAgent(proxyUrl, agentOptions);
      } else {
        // For HTTP, also use HttpsProxyAgent (it handles both protocols)
        httpsAgent = new HttpsProxyAgent(proxyUrl.replace('http://', 'https://'), agentOptions);
      }
      httpAgent = httpsAgent;
    }

    return { httpsAgent, httpAgent };
  }

  /**
   * Get Content-Type header based on body type
   */
  private getContentType(bodyType: BodyType): string {
    switch (bodyType) {
      case "json":
        return "application/json";
      case "xml":
        return "application/xml";
      case "graphql":
        return "application/json";
      case "text":
        return "text/plain";
      case "form-data":
        return "multipart/form-data";
      default:
        return "application/json";
    }
  }

  private formatBodyForLog(body: any): string {
    if (body === undefined || body === null) return "";
    if (typeof body === "string") return body;
    if (Buffer.isBuffer(body)) return `<Buffer length=${body.length}>`;
    if (
      typeof (body as any).getBoundary === "function" ||
      typeof (body as any).getHeaders === "function"
    ) {
      return "[form-data stream]";
    }
    try {
      return JSON.stringify(body);
    } catch {
      return "[unserializable body]";
    }
  }

  /**
   * Apply REST authentication to headers
   */
  private applyAuth(
    headers: Record<string, string>,
    restConfig?: RestConfig,
  ): void {
    if (!restConfig?.auth) return;

    const auth = restConfig.auth;

    switch (auth.type) {
      case "basic":
        if (auth.username && auth.password) {
          const credentials = Buffer.from(
            `${auth.username}:${auth.password}`,
          ).toString("base64");
          headers["Authorization"] = `Basic ${credentials}`;
        }
        break;

      case "bearer":
        if (auth.token) {
          headers["Authorization"] = `Bearer ${auth.token}`;
        }
        break;

      case "apiKey":
        if (auth.token && auth.apiKeyName) {
          if (auth.apiKeyIn === "header") {
            headers[auth.apiKeyName] = auth.token;
          }
          // Query param handled in executeRest
        }
        break;
    }
  }
}
