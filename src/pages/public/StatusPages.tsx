import React from 'react';
import {FileQuestion, ShieldOff} from 'lucide-react';
import {Link} from 'react-router-dom';

export const UnauthorizedPage: React.FC = () => (
  <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
    <div className="max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
      <ShieldOff className="mx-auto h-9 w-9 text-red-600" />
      <h1 className="mt-4 font-display text-xl font-bold text-slate-900">Access Restricted</h1>
      <p className="mt-2 text-sm text-slate-600">
        Your current context or assigned club permissions do not authorize access to this page.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link
          to="/login"
          className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800"
        >
          Switch Context
        </Link>
        <Link
          to="/"
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Home
        </Link>
      </div>
    </div>
  </div>
);

export const NotFoundPage: React.FC = () => (
  <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
    <div className="max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
      <FileQuestion className="mx-auto h-9 w-9 text-slate-500" />
      <h1 className="mt-4 font-display text-xl font-bold text-slate-900">Page Not Found</h1>
      <p className="mt-2 text-sm text-slate-600">
        The CampusVerse route you requested does not exist or has moved.
      </p>
      <div className="mt-6 flex justify-center">
        <Link
          to="/"
          className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800"
        >
          Return to CampusVerse
        </Link>
      </div>
    </div>
  </div>
);
