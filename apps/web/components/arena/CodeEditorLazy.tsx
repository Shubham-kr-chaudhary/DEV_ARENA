'use client';

import dynamic from 'next/dynamic';
import { EditorLoadingSkeleton, type MonacoCodeEditorProps } from './MonacoCodeEditor';

const DynamicMonacoCodeEditor = dynamic(() => import('./MonacoCodeEditor'), {
  ssr: false,
  loading: () => <EditorLoadingSkeleton />,
});

export function CodeEditorLazy(props: MonacoCodeEditorProps) {
  return <DynamicMonacoCodeEditor {...props} />;
}
