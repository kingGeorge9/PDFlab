import { useCallback, useEffect, useState } from 'react';
import permissionService, {
    PermissionStatus,
    PermissionType
} from '../services/permissionService';

interface UsePermissionsResult {
  storageStatus: PermissionStatus | null;
  isLoading: boolean;
  isGranted: boolean;
  denialCount: number;
  requestPermission: () => Promise<boolean>;
  requestWithRationale: () => Promise<boolean>;
  requestWithUI: () => Promise<boolean>;
  openSettings: () => Promise<void>;
  recheckPermission: () => Promise<void>;
}

/**
 * Hook for managing storage permissions in components
 */
export function useStoragePermission(): UsePermissionsResult {
  const [storageStatus, setStorageStatus] = useState<PermissionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [denialCount, setDenialCount] = useState(0);

  const checkPermission = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await permissionService.checkStoragePermission();
      setStorageStatus(result.status);
      const count = await permissionService.getDenialCount('storage');
      setDenialCount(count);
    } catch (error) {
      console.error('Error checking permission:', error);
      setStorageStatus('unavailable');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkPermission();
  }, [checkPermission]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      const result = await permissionService.requestStoragePermission();
      setStorageStatus(result.status);
      return result.status === 'granted' || result.status === 'limited';
    } catch (error) {
      console.error('Error requesting permission:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const requestWithUI = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      const result = await permissionService.requestPermissionWithUI('storage');
      setStorageStatus(result.status);
      const count = await permissionService.getDenialCount('storage');
      setDenialCount(count);
      return result.status === 'granted' || result.status === 'limited';
    } catch (error) {
      console.error('Error requesting permission with UI:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const requestWithRationale = useCallback(async (): Promise<boolean> => {
    return new Promise(resolve => {
      permissionService.showPermissionRationale(
        async () => {
          const granted = await requestPermission();
          resolve(granted);
        },
        () => resolve(false)
      );
    });
  }, [requestPermission]);

  const openSettings = useCallback(async () => {
    await permissionService.openAppSettings();
  }, []);

  const recheckPermission = useCallback(async () => {
    await checkPermission();
  }, [checkPermission]);

  return {
    storageStatus,
    isLoading,
    isGranted: storageStatus === 'granted' || storageStatus === 'limited',
    denialCount,
    requestPermission,
    requestWithRationale,
    requestWithUI,
    openSettings,
    recheckPermission,
  };
}

/**
 * Generic hook for any permission type
 */
export function usePermission(type: PermissionType) {
  const [status, setStatus] = useState<PermissionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [denialCount, setDenialCount] = useState(0);

  const checkPermission = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await permissionService.checkPermission(type);
      setStatus(result.status);
      const count = await permissionService.getDenialCount(type);
      setDenialCount(count);
    } catch (error) {
      console.error(`Error checking ${type} permission:`, error);
      setStatus('unavailable');
    } finally {
      setIsLoading(false);
    }
  }, [type]);

  useEffect(() => {
    checkPermission();
  }, [checkPermission]);

  const requestWithUI = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      const result = await permissionService.requestPermissionWithUI(type);
      setStatus(result.status);
      const count = await permissionService.getDenialCount(type);
      setDenialCount(count);
      return result.status === 'granted' || result.status === 'limited';
    } catch (error) {
      console.error(`Error requesting ${type} permission:`, error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [type]);

  const ensure = useCallback(async (): Promise<boolean> => {
    return permissionService.ensurePermission(type);
  }, [type]);

  return {
    status,
    isLoading,
    isGranted: status === 'granted' || status === 'limited',
    isBlocked: status === 'blocked',
    denialCount,
    requestWithUI,
    ensure,
    recheck: checkPermission,
    openSettings: permissionService.openAppSettings,
  };
}

/**
 * Hook for checking and requesting file access permission before an action
 */
export function useFileAccess() {
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);

  const ensureAccess = useCallback(async (): Promise<boolean> => {
    const result = await permissionService.requestFileAccessWithPrompt();
    const granted = result.status === 'granted' || result.status === 'limited';
    setHasAccess(granted);
    return granted;
  }, []);

  const checkAccess = useCallback(async (): Promise<boolean> => {
    const result = await permissionService.checkFileAccessPermission();
    const granted = result.status === 'granted' || result.status === 'limited';
    setHasAccess(granted);
    return granted;
  }, []);

  return {
    hasAccess,
    ensureAccess,
    checkAccess,
  };
}

/**
 * Hook for getting all permission statuses at once
 */
export function useAllPermissions() {
  const [permissions, setPermissions] = useState<Record<PermissionType, PermissionStatus | null>>({
    storage: null,
    camera: null,
    media: null,
    microphone: null,
  });
  const [isLoading, setIsLoading] = useState(true);

  const checkAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const statuses = await permissionService.getAllPermissionStatuses();
      setPermissions({
        storage: statuses.storage.status,
        camera: statuses.camera.status,
        media: statuses.media.status,
        microphone: statuses.microphone.status,
      });
    } catch (error) {
      console.error('Error checking all permissions:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAll();
  }, [checkAll]);

  return {
    permissions,
    isLoading,
    recheckAll: checkAll,
  };
}

export default useStoragePermission;
