/**
 * Document Manager Module - Barrel Export
 */

// ============================================================================
// COMPONENTS
// ============================================================================
export { PdfViewer } from './components/pdf-viewer';
export type { PdfViewerProps } from './components/pdf-viewer';

// ============================================================================
// HOOKS
// ============================================================================
export {
    extractDisplayName,
    generateId,
    getExtension,
    isSafUri,
    useQuickAccess
} from './hooks/use-library';
export type {
    AddFileParams,
    AddFileResult,
    QuickAccessFile,
    QuickAccessState
} from './hooks/use-library';

// Alias for backwards compatibility
export { useQuickAccess as useLibrary } from './hooks/use-library';

// ============================================================================
// UTILITIES
// ============================================================================
export {
    fileMatchesSearch,
    formatDateTime,
    formatFileSize,
    formatRelativeTime,
    getExtensionFromMime,
    getFileCategory,
    getFileExtension,
    getFileName,
    getMimeType,
    getParentPath,
    isSafUri as isSafUriUtil,
    isValidFileUri,
    truncatePath
} from './utils/file-utils';
export type { FileCategory } from './utils/file-utils';

export {
    SUPPORTED_FILE_TYPES,
    formatFileSizeForPicker,
    getAllowedTypesDescription,
    isFilePickerAvailable,
    pickDocuments,
    pickFile,
    pickFiles,
    pickFilesWithResult,
    pickImages,
    pickPDFWithResult,
    pickPDFs
} from './utils/file-picker';
export type {
    FilePickerOptions,
    FilePickerResult,
    PickedFile
} from './utils/file-picker';

export {
    canViewInApp,
    getViewerType,
    openWithSystemApp,
    showOpenFailedAlert,
    showOpenWithDialog
} from './utils/file-viewer';
export type { FileViewerOptions, ViewerResult } from './utils/file-viewer';

export {
    clearPdfCache,
    getCachedPdfUri,
    isPdfUri,
    normalizePdfUri
} from './utils/pdf-viewer';

// ============================================================================
// FILE MANAGER (Permanent Storage)
// ============================================================================
export {
    deleteFile,
    fileExists,
    getFileInfo,
    getStorageDirectory,
    initializeStorage,
    listStoredFiles,
    pickAndSaveFile
} from './file-manager';
export type { StoredFile } from './file-manager';

// ============================================================================
// DESIGN SYSTEM
// ============================================================================
export {
    AnimationDurations,
    BorderRadius,
    DarkTheme,
    FileTypeConfig,
    LightTheme,
    Palette,
    Shadows,
    Spacing,
    Typography,
    getFileTypeConfig
} from './constants/design-system';

