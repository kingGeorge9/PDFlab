// Barrel export for AI module
export type { AIProvider } from "./ai.provider";
export {
    analyze,
    askPdfQuestion,
    clearAllSessions,
    copyToClipboard,
    createMessage,
    createSession,
    deleteSession,
    deriveSessionTitle,
    extractData,
    extractDocumentText,
    extractTasks,
    fillForm,
    generateContent,
    getAIProvider,
    initAIProvider,
    loadSessions,
    pickDocument,
    saveSession,
    sendChat,
    setAIProvider,
    summarize,
    translate
} from "./ai.service";
export type { AskPdfResult } from "./ai.service";
export * from "./ai.types";
export {
    clearAIScreenState,
    getAIScreenState,
    hasUnfinishedWork,
    saveAIScreenState
} from "./aiScreenState";
export type { AIScreenSnapshot } from "./aiScreenState";
export { BackendAIProvider } from "./providers/backend.provider";
export { MockAIProvider } from "./providers/mock.provider";

