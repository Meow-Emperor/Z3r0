import { apiForm, defineJsonEndpoint } from "./client";
import { buildQuery } from "./query";
import type {
  DeleteKnowledgeDocumentResponse,
  GetKnowledgeDocumentResponse,
  GetKnowledgeGraphParams,
  GetKnowledgeGraphResponse,
  GetKnowledgeVectorResponse,
  KnowledgeDocumentPathParams,
  KnowledgeVectorPathParams,
  QueryKnowledgeDocumentsParams,
  QueryKnowledgeDocumentsResponse,
  QueryKnowledgeVectorsParams,
  QueryKnowledgeVectorsResponse,
  SearchKnowledgeGraphParams,
  SearchKnowledgeGraphResponse,
  UploadKnowledgeDocumentsResponse,
} from "./types";

const KNOWLEDGES_PATH = "/api/knowledges";

export const queryKnowledgeDocuments = defineJsonEndpoint<
  [params: QueryKnowledgeDocumentsParams], QueryKnowledgeDocumentsResponse
>("GET", (params) => `${KNOWLEDGES_PATH}/documents${buildQuery(params)}`);

export function uploadKnowledgeDocuments(files: File[]) {
  const form = new FormData();
  files.forEach((file) => form.append("files", file));
  return apiForm<UploadKnowledgeDocumentsResponse>(`${KNOWLEDGES_PATH}/documents`, form);
}

export const getKnowledgeDocument = defineJsonEndpoint<
  [documentId: KnowledgeDocumentPathParams["document_id"]], GetKnowledgeDocumentResponse
>("GET", (documentId) => `${KNOWLEDGES_PATH}/documents/${encodeURIComponent(documentId)}`);
export const deleteKnowledgeDocument = defineJsonEndpoint<
  [documentId: KnowledgeDocumentPathParams["document_id"]], DeleteKnowledgeDocumentResponse
>("DELETE", (documentId) => `${KNOWLEDGES_PATH}/documents/${encodeURIComponent(documentId)}`);
export const queryKnowledgeVectors = defineJsonEndpoint<[params: QueryKnowledgeVectorsParams], QueryKnowledgeVectorsResponse>(
  "GET", (params) => `${KNOWLEDGES_PATH}/vectors${buildQuery(params)}`,
);
export const getKnowledgeVector = defineJsonEndpoint<
  [vectorId: KnowledgeVectorPathParams["vector_id"]], GetKnowledgeVectorResponse
>("GET", (vectorId) => `${KNOWLEDGES_PATH}/vectors/${encodeURIComponent(vectorId)}`);
export const getKnowledgeGraph = defineJsonEndpoint<[params: GetKnowledgeGraphParams], GetKnowledgeGraphResponse>(
  "GET", (params) => `${KNOWLEDGES_PATH}/graph${buildQuery(params)}`,
);
export const searchKnowledgeGraph = defineJsonEndpoint<[params: SearchKnowledgeGraphParams], SearchKnowledgeGraphResponse>(
  "GET", (params) => `${KNOWLEDGES_PATH}/graph/search${buildQuery(params)}`,
);
