/**
 * Attachment Utility
 * 
 * Handles SOAP attachment processing:
 * - Base64 inline replacement
 * - SwA/MTOM multipart request building
 */

import * as fs from 'fs';
import * as path from 'path';
import * as FormData from 'form-data';
import { SoapAttachment } from '@shared/models';

export class AttachmentUtil {
    /**
     * Inline Base64 attachments into the XML by replacing cid: references
     */
    static inlineBase64Attachments(xml: string, attachments: SoapAttachment[]): string {
        let result = xml;
        const base64Attachments = attachments.filter(a => a.type === 'Base64');

        for (const att of base64Attachments) {
            try {
                const content = fs.readFileSync(att.fsPath);
                const base64 = content.toString('base64');

                // Replace cid:contentId references with actual base64 content
                result = result.replace(new RegExp(`cid:${att.contentId}`, 'g'), base64);
            } catch (error: any) {
                console.error(`Failed to read attachment ${att.name}: ${error.message}`);
            }
        }

        return result;
    }

    /**
     * Check if any attachments require multipart handling
     */
    static hasMultipartAttachments(attachments: SoapAttachment[]): boolean {
        return attachments.some(a => a.type === 'SwA' || a.type === 'MTOM');
    }

    /**
     * Build a multipart request for SwA/MTOM attachments
     */
    static buildMultipartRequest(xml: string, attachments: SoapAttachment[]): FormData {
        const form = new FormData();

        // First part: the SOAP envelope
        form.append('xmlPayload', Buffer.from(xml, 'utf8'), {
            contentType: 'text/xml; charset=utf-8',
            filename: 'soap-envelope.xml'
        });

        // Add binary attachments
        const multipartAttachments = attachments.filter(a => a.type === 'SwA' || a.type === 'MTOM');
        for (const att of multipartAttachments) {
            try {
                const stream = fs.createReadStream(att.fsPath);
                form.append(att.contentId, stream, {
                    filename: att.name,
                    contentType: att.contentType
                });
            } catch (error: any) {
                console.error(`Failed to read attachment ${att.name}: ${error.message}`);
            }
        }

        return form;
    }

    /**
     * Get Content-Type header for multipart request
     */
    static getMultipartContentType(form: FormData): string {
        return form.getHeaders()['content-type'];
    }

    /**
     * Process all attachments for a request
     * Returns the processed XML and optional FormData for multipart
     */
    static processAttachments(
        xml: string,
        attachments: SoapAttachment[]
    ): { xml: string; formData?: FormData; isMultipart: boolean } {
        if (!attachments || attachments.length === 0) {
            return { xml, isMultipart: false };
        }

        // First, inline any Base64 attachments
        const processedXml = this.inlineBase64Attachments(xml, attachments);

        // Check if we need multipart
        if (this.hasMultipartAttachments(attachments)) {
            const formData = this.buildMultipartRequest(processedXml, attachments);
            return { xml: processedXml, formData, isMultipart: true };
        }

        return { xml: processedXml, isMultipart: false };
    }

    /**
     * Detect content type from file extension
     */
    static detectContentType(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes: Record<string, string> = {
            '.pdf': 'application/pdf',
            '.xml': 'application/xml',
            '.json': 'application/json',
            '.txt': 'text/plain',
            '.html': 'text/html',
            '.htm': 'text/html',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.bmp': 'image/bmp',
            '.svg': 'image/svg+xml',
            '.webp': 'image/webp',
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.mp4': 'video/mp4',
            '.avi': 'video/x-msvideo',
            '.mov': 'video/quicktime',
            '.zip': 'application/zip',
            '.gz': 'application/gzip',
            '.tar': 'application/x-tar',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.xls': 'application/vnd.ms-excel',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '.ppt': 'application/vnd.ms-powerpoint',
            '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        };
        return mimeTypes[ext] || 'application/octet-stream';
    }
}
