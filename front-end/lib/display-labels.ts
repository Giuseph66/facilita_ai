const documentStatuses: Record<string, string> = {
  UPLOADING: "Enviando arquivo",
  QUEUED: "Aguardando na fila",
  PENDING: "Aguardando processamento",
  PROCESSING: "Processando",
  READING: "Lendo conteúdo",
  EXTRACTING: "Lendo conteúdo",
  INDEXING: "Preparando conteúdo para busca",
  READY: "Pronto para estudar",
  COMPLETED: "Pronto para estudar",
  FAILED: "Falha no processamento",
  ERROR: "Falha no processamento",
  DELETING: "Removendo arquivo",
};

const documentStages: Record<string, string> = {
  UPLOADING: "Enviando arquivo",
  QUEUED: "Aguardando na fila",
  EXTRACTING: "Lendo o arquivo",
  INDEXING: "Preparando o conteúdo para busca",
  DELETING: "Removendo arquivo",
};

export function documentStatusLabel(status?: string) {
  return status ? documentStatuses[status.toUpperCase()] || "Status atualizado" : "Status atualizado";
}

export function documentStageLabel(stage?: string) {
  return stage ? documentStages[stage.toUpperCase()] || "Atualização do processamento." : "";
}

export function documentProgressLabel(status?: string, stage?: string) {
  const statusCopy = documentStatusLabel(status);
  const stageCopy = documentStageLabel(stage);
  return stageCopy && stageCopy !== statusCopy ? `${statusCopy} · ${stageCopy}` : statusCopy;
}

export function materialKindLabel(kind?: string) {
  const labels: Record<string, string> = {
    PDF: "PDF",
    PPTX: "Apresentação PowerPoint",
  };
  return kind ? labels[kind.toUpperCase()] || "Material" : "Material";
}

export function enrollmentStatusLabel(status?: string) {
  const labels: Record<string, string> = {
    ACTIVE: "Matrícula ativa",
    ENROLLED: "Matrícula ativa",
    PENDING: "Matrícula pendente",
    INVITED: "Convite pendente",
    INACTIVE: "Matrícula encerrada",
    REMOVED: "Matrícula encerrada",
  };
  return status ? labels[status.toUpperCase()] || "Matrícula" : "Matrícula";
}

export function assessmentStateLabel(state?: string) {
  const labels: Record<string, string> = {
    DRAFT: "Rascunho privado",
    READY: "Pronta para finalizar",
    PUBLISHED: "Finalizada · privada",
    ARCHIVED: "Arquivada",
  };
  return state ? labels[state.toUpperCase()] || "Estado atualizado" : "Estado atualizado";
}

export function assessmentQuestionTypeLabel(type?: string) {
  const labels: Record<string, string> = {
    MULTIPLE_CHOICE: "Múltipla escolha",
    SHORT_ANSWER: "Resposta curta",
    ESSAY: "Dissertativa",
  };
  return type ? labels[type.toUpperCase()] || "Questão" : "Questão";
}

export function questionCountLabel(count?: number | null) {
  return count == null ? "Contagem indisponível" : `${count} ${count === 1 ? "questão" : "questões"}`;
}

export function privacyRequestStateLabel(state?: string) {
  const labels: Record<string, string> = {
    PENDING: "Aguardando processamento",
    PROCESSING: "Em processamento",
    COMPLETED: "Concluído",
    FAILED: "Falhou",
  };
  return state ? labels[state.toUpperCase()] || "Estado atualizado" : "Estado atualizado";
}

export function workspaceRoleLabel(role?: string) {
  const labels: Record<string, string> = {
    TEACHER: "Docente",
    PROFESSOR: "Docente",
    STUDENT: "Acadêmico",
    ALUNO: "Acadêmico",
    MEMBER: "Acadêmico",
  };
  return role ? labels[role.toUpperCase()] || "Outro papel" : "Outro papel";
}
