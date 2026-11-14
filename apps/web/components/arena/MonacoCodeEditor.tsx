'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type UIEvent,
} from 'react';
import { ARENA_LANGUAGES, type ArenaLanguageSlug } from '../../lib/arena-templates';

export interface CursorPosition {
  readonly lineNumber: number;
  readonly column: number;
}

export interface MonacoCodeEditorProps {
  readonly value: string;
  readonly language: ArenaLanguageSlug;
  readonly fontSize: number;
  readonly onChange: (nextValue: string) => void;
  readonly onCursorChange?: ((position: CursorPosition) => void) | undefined;
  readonly onEngineModeChange?: ((mode: 'monaco' | 'fallback' | 'loading') => void) | undefined;
}

interface MonacoDisposable {
  dispose(): void;
}

interface MonacoTextModel {
  getValue(): string;
  setValue(newValue: string): void;
  dispose(): void;
}

interface MonacoStandaloneEditor {
  getValue(): string;
  setValue(newValue: string): void;
  getModel(): MonacoTextModel | null;
  updateOptions(options: Record<string, unknown>): void;
  layout(): void;
  onDidChangeModelContent(listener: () => void): MonacoDisposable;
  onDidChangeCursorPosition(
    listener: (event: { position: { lineNumber: number; column: number } }) => void,
  ): MonacoDisposable;
  dispose(): void;
}

interface MonacoGlobalNamespace {
  editor: {
    defineTheme(name: string, themeData: Record<string, unknown>): void;
    create(container: HTMLElement, options: Record<string, unknown>): MonacoStandaloneEditor;
    setModelLanguage(model: MonacoTextModel, languageId: string): void;
  };
}

interface MonacoAmdRequire {
  config(options: { paths: { vs: string } }): void;
  (modules: readonly string[], onLoad: () => void, onError?: (err: unknown) => void): void;
}

interface MonacoBrowserHost {
  monaco?: MonacoGlobalNamespace;
  require?: MonacoAmdRequire;
}

const DEFAULT_MONACO_VS_URL =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_MONACO_VS_PATH
    ? process.env.NEXT_PUBLIC_MONACO_VS_PATH
    : 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs';

const MONACO_LOADER_TIMEOUT_MS = 3500;

let monacoLoadPromise: Promise<MonacoGlobalNamespace> | null = null;

function loadMonacoFromRuntime(): Promise<MonacoGlobalNamespace> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Monaco can only be loaded in the browser.'));
  }

  const win = window as unknown as MonacoBrowserHost;
  if (win.monaco?.editor) {
    return Promise.resolve(win.monaco);
  }

  if (monacoLoadPromise) {
    return monacoLoadPromise;
  }

  monacoLoadPromise = new Promise<MonacoGlobalNamespace>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error('Timed out loading Monaco Editor runtime.'));
    }, MONACO_LOADER_TIMEOUT_MS);

    const initializeEditorModule = () => {
      if (!win.require) {
        window.clearTimeout(timeoutId);
        reject(new Error('Monaco AMD loader is unavailable.'));
        return;
      }

      try {
        win.require.config({ paths: { vs: DEFAULT_MONACO_VS_URL } });
        win.require(
          ['vs/editor/editor.main'],
          () => {
            window.clearTimeout(timeoutId);
            if (win.monaco?.editor) {
              win.monaco.editor.defineTheme('devarena-zinc-dark', {
                base: 'vs-dark',
                inherit: true,
                rules: [
                  { token: 'comment', foreground: '71717a', fontStyle: 'italic' },
                  { token: 'keyword', foreground: '38bdf8' },
                  { token: 'number', foreground: 'f59e0b' },
                  { token: 'string', foreground: '34d399' },
                  { token: 'type', foreground: 'a78bfa' },
                ],
                colors: {
                  'editor.background': '#09090b',
                  'editor.foreground': '#f4f4f5',
                  'editor.lineHighlightBackground': '#18181b',
                  'editorLineNumber.foreground': '#52525b',
                  'editorLineNumber.activeForeground': '#e4e4e7',
                  'editor.selectionBackground': '#27272a',
                  'editorIndentGuide.background1': '#18181b',
                  'editorIndentGuide.activeBackground1': '#3f3f46',
                },
              });
              resolve(win.monaco);
            } else {
              reject(new Error('Monaco editor namespace failed to initialize.'));
            }
          },
          (err: unknown) => {
            window.clearTimeout(timeoutId);
            reject(err instanceof Error ? err : new Error('Failed to load Monaco module.'));
          },
        );
      } catch (error) {
        window.clearTimeout(timeoutId);
        reject(error);
      }
    };

    if (win.require) {
      initializeEditorModule();
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-devarena-monaco-loader="true"]',
    );

    if (existingScript) {
      existingScript.addEventListener('load', initializeEditorModule, { once: true });
      existingScript.addEventListener(
        'error',
        () => {
          window.clearTimeout(timeoutId);
          reject(new Error('Failed to load Monaco loader script.'));
        },
        { once: true },
      );
      return;
    }

    const script = document.createElement('script');
    script.src = `${DEFAULT_MONACO_VS_URL}/loader.js`;
    script.async = true;
    script.dataset.devarenaMonacoLoader = 'true';
    script.onload = initializeEditorModule;
    script.onerror = () => {
      window.clearTimeout(timeoutId);
      reject(new Error('Failed to load Monaco loader script.'));
    };
    document.head.appendChild(script);
  }).catch((error) => {
    monacoLoadPromise = null;
    throw error;
  });

  return monacoLoadPromise;
}

function computeLineAndColumn(text: string, selectionStart: number): CursorPosition {
  const safeOffset = Math.max(0, Math.min(selectionStart, text.length));
  const prefix = text.slice(0, safeOffset);
  const lines = prefix.split('\n');
  const lineNumber = lines.length;
  const lastLine = lines[lines.length - 1] ?? '';
  return {
    lineNumber,
    column: lastLine.length + 1,
  };
}

export function EditorLoadingSkeleton() {
  return (
    <div
      role="status"
      aria-label="Initializing code editor"
      className="flex h-full min-h-[320px] w-full flex-col justify-between bg-zinc-950 p-4 font-mono text-xs text-zinc-500"
    >
      <div className="space-y-2.5">
        <div className="flex items-center gap-3">
          <span className="w-6 text-right text-zinc-600">1</span>
          <div className="h-3.5 w-48 animate-pulse rounded bg-zinc-900" />
        </div>
        <div className="flex items-center gap-3">
          <span className="w-6 text-right text-zinc-600">2</span>
          <div className="h-3.5 w-64 animate-pulse rounded bg-zinc-900" />
        </div>
        <div className="flex items-center gap-3">
          <span className="w-6 text-right text-zinc-600">3</span>
          <div className="h-3.5 w-32 animate-pulse rounded bg-zinc-900" />
        </div>
        <div className="flex items-center gap-3">
          <span className="w-6 text-right text-zinc-600">4</span>
          <div className="h-3.5 w-56 animate-pulse rounded bg-zinc-900" />
        </div>
      </div>
      <p className="text-[11px] text-zinc-500">Initializing Monaco code editor...</p>
    </div>
  );
}

/**
 * Synchronized, keyboard-accessible code editor used when Monaco Editor's runtime
 * cannot be loaded (e.g., offline local development or restricted network environments).
 */
function FallbackSynchronizedCodeEditor({
  value,
  language,
  fontSize,
  onChange,
  onCursorChange,
}: {
  readonly value: string;
  readonly language: ArenaLanguageSlug;
  readonly fontSize: number;
  readonly onChange: (nextValue: string) => void;
  readonly onCursorChange?: ((position: CursorPosition) => void) | undefined;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const [activeLine, setActiveLine] = useState(1);

  const lineCount = useMemo(() => Math.max(1, value.split('\n').length), [value]);
  const lineNumbers = useMemo(
    () => Array.from({ length: lineCount }, (_, index) => index + 1),
    [lineCount],
  );

  const tabSpaces = ' '.repeat(ARENA_LANGUAGES[language].defaultTabSize);

  function syncCursorState(target: HTMLTextAreaElement) {
    const pos = computeLineAndColumn(target.value, target.selectionStart ?? 0);
    setActiveLine(pos.lineNumber);
    if (onCursorChange) {
      onCursorChange(pos);
    }
  }

  function handleScroll(event: UIEvent<HTMLTextAreaElement>) {
    if (gutterRef.current) {
      gutterRef.current.scrollTop = event.currentTarget.scrollTop;
    }
  }

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    onChange(event.target.value);
    syncCursorState(event.target);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const target = event.currentTarget;
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? 0;

    if (event.key === 'Tab') {
      event.preventDefault();
      const nextValue = `${value.slice(0, start)}${tabSpaces}${value.slice(end)}`;
      onChange(nextValue);

      requestAnimationFrame(() => {
        if (textareaRef.current) {
          const nextCursor = start + tabSpaces.length;
          textareaRef.current.selectionStart = nextCursor;
          textareaRef.current.selectionEnd = nextCursor;
          syncCursorState(textareaRef.current);
        }
      });
      return;
    }

    if (event.key === 'Enter') {
      const beforeCursor = value.slice(0, start);
      const lastNewline = beforeCursor.lastIndexOf('\n');
      const currentLine = beforeCursor.slice(lastNewline + 1);
      const leadingWhitespaceMatch = /^(\s+)/.exec(currentLine);
      const baseIndent = leadingWhitespaceMatch?.[1] ?? '';
      const trimmedRight = currentLine.trimEnd();
      const extraIndent = trimmedRight.endsWith('{') ? tabSpaces : '';

      if (baseIndent.length > 0 || extraIndent.length > 0) {
        event.preventDefault();
        const insertion = `\n${baseIndent}${extraIndent}`;
        const nextValue = `${value.slice(0, start)}${insertion}${value.slice(end)}`;
        onChange(nextValue);

        requestAnimationFrame(() => {
          if (textareaRef.current) {
            const nextCursor = start + insertion.length;
            textareaRef.current.selectionStart = nextCursor;
            textareaRef.current.selectionEnd = nextCursor;
            syncCursorState(textareaRef.current);
          }
        });
      }
    }
  }

  const lineHeightPx = Math.round(fontSize * 1.6);

  return (
    <div className="relative flex h-full min-h-[320px] w-full overflow-hidden bg-zinc-950 font-mono">
      <div
        ref={gutterRef}
        aria-hidden="true"
        className="w-12 shrink-0 select-none overflow-hidden border-r border-zinc-800/80 bg-zinc-950 py-3 pr-3 text-right text-zinc-600"
        style={{ fontSize: `${fontSize}px`, lineHeight: `${lineHeightPx}px` }}
      >
        {lineNumbers.map((lineNum) => (
          <div
            key={lineNum}
            className={lineNum === activeLine ? 'font-semibold text-zinc-200' : 'text-zinc-600'}
          >
            {lineNum}
          </div>
        ))}
      </div>

      <textarea
        ref={textareaRef}
        aria-label={`${ARENA_LANGUAGES[language].label} source code editor`}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onScroll={handleScroll}
        onClick={(e) => syncCursorState(e.currentTarget)}
        onKeyUp={(e) => syncCursorState(e.currentTarget)}
        className="h-full w-full resize-none overflow-auto bg-zinc-950 px-4 py-3 font-mono text-zinc-100 caret-sky-400 focus:outline-none"
        style={{
          fontSize: `${fontSize}px`,
          lineHeight: `${lineHeightPx}px`,
          tabSize: ARENA_LANGUAGES[language].defaultTabSize,
        }}
      />
    </div>
  );
}

export default function MonacoCodeEditor({
  value,
  language,
  fontSize,
  onChange,
  onCursorChange,
  onEngineModeChange,
}: MonacoCodeEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<MonacoStandaloneEditor | null>(null);
  const monacoRef = useRef<MonacoGlobalNamespace | null>(null);
  const suppressChangeRef = useRef(false);
  const latestValueRef = useRef(value);
  const latestLanguageRef = useRef(language);
  const latestFontSizeRef = useRef(fontSize);
  const onChangeRef = useRef(onChange);
  const onCursorChangeRef = useRef(onCursorChange);
  const onEngineModeChangeRef = useRef(onEngineModeChange);

  const [engineMode, setEngineMode] = useState<'loading' | 'monaco' | 'fallback'>('loading');

  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  useEffect(() => {
    latestLanguageRef.current = language;
  }, [language]);

  useEffect(() => {
    latestFontSizeRef.current = fontSize;
  }, [fontSize]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onCursorChangeRef.current = onCursorChange;
  }, [onCursorChange]);

  useEffect(() => {
    onEngineModeChangeRef.current = onEngineModeChange;
  }, [onEngineModeChange]);

  useEffect(() => {
    let disposed = false;
    let contentListener: MonacoDisposable | null = null;
    let cursorListener: MonacoDisposable | null = null;
    let resizeObserver: ResizeObserver | null = null;

    if (onEngineModeChangeRef.current) {
      onEngineModeChangeRef.current('loading');
    }

    loadMonacoFromRuntime()
      .then((monaco) => {
        if (disposed || !containerRef.current) {
          return;
        }

        monacoRef.current = monaco;
        const langMeta = ARENA_LANGUAGES[latestLanguageRef.current];

        const editor = monaco.editor.create(containerRef.current, {
          value: latestValueRef.current,
          language: langMeta.monacoLanguage,
          theme: 'devarena-zinc-dark',
          fontSize: latestFontSizeRef.current,
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          lineNumbers: 'on',
          tabSize: langMeta.defaultTabSize,
          insertSpaces: true,
          autoIndent: 'full',
          formatOnPaste: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          padding: { top: 12, bottom: 12 },
          bracketPairColorization: { enabled: true },
          renderLineHighlight: 'all',
          smoothScrolling: true,
        });

        editorRef.current = editor;

        contentListener = editor.onDidChangeModelContent(() => {
          if (suppressChangeRef.current) {
            return;
          }
          const currentVal = editor.getValue();
          latestValueRef.current = currentVal;
          onChangeRef.current(currentVal);
        });

        cursorListener = editor.onDidChangeCursorPosition((event) => {
          if (onCursorChangeRef.current) {
            onCursorChangeRef.current({
              lineNumber: event.position.lineNumber,
              column: event.position.column,
            });
          }
        });

        if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
          resizeObserver = new ResizeObserver(() => {
            editor.layout();
          });
          resizeObserver.observe(containerRef.current);
        }

        setEngineMode('monaco');
        if (onEngineModeChangeRef.current) {
          onEngineModeChangeRef.current('monaco');
        }
      })
      .catch(() => {
        if (disposed) {
          return;
        }
        setEngineMode('fallback');
        if (onEngineModeChangeRef.current) {
          onEngineModeChangeRef.current('fallback');
        }
      });

    return () => {
      disposed = true;
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (contentListener) {
        contentListener.dispose();
      }
      if (cursorListener) {
        cursorListener.dispose();
      }
      if (editorRef.current) {
        const model = editorRef.current.getModel();
        editorRef.current.dispose();
        if (model) {
          model.dispose();
        }
        editorRef.current = null;
      }
    };
  }, []);

  // Synchronize external value updates (e.g. language switch or template reset) into Monaco
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    if (editor.getValue() !== value) {
      suppressChangeRef.current = true;
      editor.setValue(value);
      suppressChangeRef.current = false;
    }
  }, [value]);

  // Synchronize language selection changes into Monaco
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) {
      return;
    }

    const model = editor.getModel();
    const langMeta = ARENA_LANGUAGES[language];
    if (model) {
      monaco.editor.setModelLanguage(model, langMeta.monacoLanguage);
    }
    editor.updateOptions({
      tabSize: langMeta.defaultTabSize,
    });
  }, [language]);

  // Synchronize font size updates into Monaco
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    editor.updateOptions({ fontSize });
  }, [fontSize]);

  if (engineMode === 'fallback') {
    return (
      <FallbackSynchronizedCodeEditor
        value={value}
        language={language}
        fontSize={fontSize}
        onChange={onChange}
        onCursorChange={onCursorChange}
      />
    );
  }

  return (
    <div className="relative h-full min-h-[320px] w-full bg-zinc-950">
      {engineMode === 'loading' ? (
        <div className="absolute inset-0 z-10">
          <EditorLoadingSkeleton />
        </div>
      ) : null}
      <div
        ref={containerRef}
        aria-label={`${ARENA_LANGUAGES[language].label} Monaco code editor`}
        className="h-full w-full"
      />
    </div>
  );
}
