import React from 'react';
import {Navigate, useLocation} from 'react-router-dom';
import type {CoreMemberPermission} from '../../../shared/constants/permissions.ts';
import {useAuth, type WorkspaceContextType} from '../../context/AuthContext.tsx';

export const RequireAuthRoute: React.FC<{children: React.ReactNode}> = ({children}) => {
  const {isAuthenticated, isInitializing} = useAuth();
  const location = useLocation();

  if (isInitializing) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-500">
        Loading workspace session...
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{from: location.pathname}} replace />;
  }
  return <>{children}</>;
};

export const RequireContextRoute: React.FC<{
  allowedContexts: WorkspaceContextType[];
  requiredPermission?: CoreMemberPermission;
  children: React.ReactNode;
}> = ({allowedContexts, requiredPermission, children}) => {
  const {isAuthenticated, isInitializing, activeContext, hasPermission} = useAuth();

  if (isInitializing) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-500">
        Loading workspace permissions...
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (!allowedContexts.includes(activeContext)) {
    return <Navigate to="/unauthorized" replace />;
  }
  if (requiredPermission && !hasPermission(requiredPermission)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
};
