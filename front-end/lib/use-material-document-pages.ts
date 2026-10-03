"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { api, errorCopy } from "@/lib/api";
import type { DocumentView, MaterialView, PageResult } from "@/lib/types";

export function useMaterialDocumentPages(
  materials: MaterialView[],
  setMaterials: Dispatch<SetStateAction<MaterialView[]>>,
) {
  const materialsRef = useRef(materials);
  const loadingRef = useRef(new Set<string>());
  const [loadingIds, setLoadingIds] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => { materialsRef.current = materials; }, [materials]);

  const loadMore = useCallback(async (materialId: string) => {
    if (loadingRef.current.has(materialId)) return;
    const material = materialsRef.current.find((item) => item.id === materialId);
    if (!material?.documentsNextCursor) return;
    loadingRef.current.add(materialId);
    setLoadingIds((current) => ({ ...current, [materialId]: true }));
    setErrors((current) => ({ ...current, [materialId]: "" }));
    try {
      const cursor = encodeURIComponent(material.documentsNextCursor);
      const page = await api<PageResult<DocumentView>>(`/materials/${materialId}/documents?cursor=${cursor}`);
      setMaterials((current) => current.map((item) => {
        if (item.id !== materialId) return item;
        const documents = new Map((item.documents || []).map((document) => [document.id, document]));
        for (const document of page.items || []) documents.set(document.id, document);
        return { ...item, documents: Array.from(documents.values()), documentsNextCursor: page.nextCursor };
      }));
    } catch (caught) {
      setErrors((current) => ({ ...current, [materialId]: errorCopy(caught) }));
    } finally {
      loadingRef.current.delete(materialId);
      setLoadingIds((current) => ({ ...current, [materialId]: false }));
    }
  }, [setMaterials]);

  return { loadMore, loadingIds, errors };
}
