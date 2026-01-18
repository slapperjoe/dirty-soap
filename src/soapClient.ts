import * as soap from "soap";
import {
  ApiService,
  SchemaNode,
  ApiRequest,
} from "../shared/src/models";
import { HttpClient } from "./services/HttpClient";
import { WsdlParser } from "./WsdlParser";
import { DiagnosticService } from "./services/DiagnosticService";
import { SettingsManager } from "./utils/SettingsManager";
import { IConfigService } from "./interfaces";

export class SoapClient {
  private client: soap.Client | null = null;
  private currentRequest: any = null;
  private outputChannel: any = null;
  private settingsManager: SettingsManager;
  private wsdlParser: WsdlParser;
  private httpClient: HttpClient;
  private configService?: IConfigService;

  constructor(settingsManager: SettingsManager, outputChannel?: any, configService?: IConfigService) {
    this.outputChannel = outputChannel;
    this.settingsManager = settingsManager;
    this.configService = configService;
    // Initial setup - settings will be refreshed on parseWsdl
    this.wsdlParser = new WsdlParser(outputChannel);
    this.httpClient = new HttpClient(settingsManager, outputChannel);
  }

  public getOutputChannel(): any {
    return this.outputChannel;
  }

  public log(message: string, data?: any) {
    // Also pipe to diagnostic service
    DiagnosticService.getInstance().log(
      "BACKEND",
      `[SoapClient] ${message} `,
      data,
    );

    if (this.outputChannel) {
      this.outputChannel.appendLine(
        `[${new Date().toLocaleTimeString()}] ${message} `,
      );
      if (data) {
        this.outputChannel.appendLine(
          typeof data === "string" ? data : JSON.stringify(data, null, 2),
        );
      }
    }
  }

  private getProxySettings() {
    // 1. Check Extension Config
    const config = this.settingsManager.getConfig();
    let proxyUrl = config.network?.proxy;
    let strictSSL = config.network?.strictSSL;

    // 2. Check platform config service (VS Code, Tauri, etc.)
    if (!proxyUrl && this.configService) {
      proxyUrl = this.configService.getProxyUrl();
    }

    // If extension setting is undefined, fall back to platform config.
    // If that is undefined, default true.
    if (strictSSL === undefined && this.configService) {
      strictSSL = this.configService.getStrictSSL();
    }
    if (strictSSL === undefined) {
      strictSSL = true;
    }

    return { proxyUrl, strictSSL };
  }

  async parseWsdl(url: string, localWsdlDir?: string): Promise<ApiService[]> {
    // Refresh settings
    const { proxyUrl, strictSSL } = this.getProxySettings();

    this.log(
      `Configuring WSDL Parser - Proxy: ${proxyUrl || "None"}, StrictSSL: ${strictSSL} `,
    );

    // Re-create parser with latest settings
    this.wsdlParser = new WsdlParser(this.outputChannel, {
      proxyUrl,
      strictSSL,
    });

    const services = await this.wsdlParser.parseWsdl(url, localWsdlDir);
    this.client = this.wsdlParser.getClient();
    return services;
  }

  public getOperationSchema(
    operationName: string,
    portName?: string,
  ): SchemaNode | null {
    return this.wsdlParser.getOperationSchema(operationName, portName);
  }

  cancelRequest() {
    // Cancel unified HttpClient request
    this.httpClient.cancelRequest();

    // Cancel node-soap request
    if (this.currentRequest) {
      try {
        if (typeof this.currentRequest.abort === "function") {
          this.currentRequest.abort();
        }
      } catch (e) {
        console.error("Error cancelling request:", e);
      }
      this.currentRequest = null;
    }
  }

  async executeRequest(
    url: string,
    operation: string,
    args: any,
    headers?: any,
  ): Promise<any> {
    const isRawMode = typeof args === "string" && args.trim().startsWith("<");

    if (!this.client && !isRawMode) {
      this.client = await soap.createClientAsync(url);
    }

    const xmlPayload =
      typeof args === "string"
        ? args
        : (this.client as any)?.wsdl?.objectToDocumentXML
          ? (this.client as any).wsdl.objectToDocumentXML(
            operation,
            args,
            "",
            (this.client as any).wsdl.definitions?.$targetNamespace,
          )
          : JSON.stringify(args);

    return this.executeRawRequest(operation, xmlPayload, headers, url);
  }

  public async executeHttpRequest(request: ApiRequest): Promise<any> {
    return this.httpClient.execute(request);
  }

  private async executeRawRequest(
    operation: string,
    xml: string,
    headers: any,
    endpointOverride?: string,
  ): Promise<any> {
    let endpoint = endpointOverride || "";
    let soapAction = "";

    if (this.client) {
      // 1. Find Endpoint from WSDL if missing
      const definitions = (this.client as any).wsdl.definitions;
      if (!endpoint) {
        for (const serviceName in definitions.services) {
          const service = definitions.services[serviceName];
          for (const portName in service.ports) {
            const port = service.ports[portName];
            if (port.location) {
              endpoint = port.location;
              break;
            }
          }
          if (endpoint) break;
        }
      }
      if (!endpoint) {
        endpoint = (this.client as any).wsdl.options.endpoint;
      }

      // 2. Find SOAPAction from WSDL
      for (const bindingName in definitions.bindings) {
        const binding = definitions.bindings[bindingName];
        if (binding.operations && binding.operations[operation]) {
          soapAction = binding.operations[operation].soapAction;
          break;
        }
      }
    }

    if (!endpoint) {
      return {
        success: false,
        error:
          "Invalid URL: Endpoint is missing. Please set the Endpoint in the request configuration.",
        rawResponse: null,
        rawRequest: xml,
        timeTaken: 0,
      };
    }

    // 3. Prepare Headers
    const requestHeaders: any = {
      "Content-Type": "text/xml;charset=UTF-8",
      ...headers,
    };
    if (soapAction) {
      requestHeaders["SOAPAction"] = soapAction;
    }

    this.log(`Methods: POST ${endpoint} `);
    this.log("Headers:", requestHeaders);
    this.log("Body:", xml);

    const response = await this.httpClient.execute({
      name: operation,
      request: xml,
      endpoint,
      headers: requestHeaders,
      requestType: "soap",
      contentType: requestHeaders["Content-Type"],
    } as ApiRequest);

    return response;
  }

  /**
   * Execute a multipart SOAP request with attachments (SwA)
   */
  async executeMultipartRequest(
    endpoint: string,
    operation: string,
    xml: string,
    formData: any,
    headers?: any,
  ): Promise<any> {
    if (!endpoint) {
      return {
        success: false,
        error: "Invalid URL: Endpoint is missing.",
        rawResponse: null,
        rawRequest: xml,
        timeTaken: 0,
      };
    }

    // Get SOAPAction from WSDL if client exists
    let soapAction = "";
    if (this.client) {
      const definitions = (this.client as any).wsdl.definitions;
      for (const bindingName in definitions.bindings) {
        const binding = definitions.bindings[bindingName];
        if (binding.operations && binding.operations[operation]) {
          soapAction = binding.operations[operation].soapAction;
          break;
        }
      }
    }

    // Prepare Headers - FormData sets its own Content-Type with boundary
    const requestHeaders: any = {
      ...formData.getHeaders(),
      ...headers,
    };
    if (soapAction) {
      requestHeaders["SOAPAction"] = soapAction;
    }

    this.log(`Multipart POST ${endpoint}`);
    this.log("Headers:", requestHeaders);

    return await this.httpClient.execute({
      name: operation,
      request: formData,
      endpoint,
      headers: requestHeaders,
      requestType: "soap",
    } as ApiRequest);
  }
}
