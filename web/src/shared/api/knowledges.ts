import { apiDelete, apiForm, apiGet } from "./client";
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

export function queryKnowledgeDocuments(params: QueryKnowledgeDocumentsParams) {
  return apiGet<QueryKnowledgeDocumentsResponse>(`${KNOWLEDGES_PATH}/documents${buildQuery(params)}`);
}

export function uploadKnowledgeDocuments(files: File[]) {
  const form = new FormData();
  files.forEach((file) => form.append("files", file));
  return apiForm<UploadKnowledgeDocumentsResponse>(`${KNOWLEDGES_PATH}/documents`, form);
}

export function getKnowledgeDocument(documentId: KnowledgeDocumentPathParams["document_id"]) {
  return apiGet<GetKnowledgeDocumentResponse>(
    `${KNOWLEDGES_PATH}/documents/${encodeURIComponent(documentId)}`,
  );
}

export function deleteKnowledgeDocument(documentId: KnowledgeDocumentPathParams["document_id"]) {
  return apiDelete<DeleteKnowledgeDocumentResponse>(
    `${KNOWLEDGES_PATH}/documents/${encodeURIComponent(documentId)}`,
  );
}

export function queryKnowledgeVectors(params: QueryKnowledgeVectorsParams) {
  return apiGet<QueryKnowledgeVectorsResponse>(`${KNOWLEDGES_PATH}/vectors${buildQuery(params)}`);
}

export function getKnowledgeVector(vectorId: KnowledgeVectorPathParams["vector_id"]) {
  return apiGet<GetKnowledgeVectorResponse>(
    `${KNOWLEDGES_PATH}/vectors/${encodeURIComponent(vectorId)}`,
  );
}

export function getKnowledgeGraph(params: GetKnowledgeGraphParams) {
  return apiGet<GetKnowledgeGraphResponse>(`${KNOWLEDGES_PATH}/graph${buildQuery(params)}`);
}

export function searchKnowledgeGraph(params: SearchKnowledgeGraphParams) {
  return apiGet<SearchKnowledgeGraphResponse>(`${KNOWLEDGES_PATH}/graph/search${buildQuery(params)}`);
}
