import { useState, useCallback, useRef, useEffect } from 'react';
import type { CommentThread, Comment, EditorRole } from '@/types/editor';

interface UseInlineCommentsOptions {
  sessionId: string;
  role: EditorRole;
  userId: string;
  userName: string;
  onThreadChange?: (threads: CommentThread[]) => void;
}

interface UseInlineCommentsReturn {
  threads: CommentThread[];
  activeThreadId: string | null;
  isLoading: boolean;
  createThread: (anchor: CommentThread['anchor'], initialComment: string) => Promise<CommentThread>;
  addComment: (threadId: string, content: string) => Promise<Comment>;
  resolveThread: (threadId: string) => Promise<void>;
  reopenThread: (threadId: string) => Promise<void>;
  deleteThread: (threadId: string) => Promise<void>;
  setActiveThread: (threadId: string | null) => void;
  getThreadForAnchor: (anchor: CommentThread['anchor']) => CommentThread | undefined;
}

export function useInlineComments({
  sessionId,
  role,
  userId,
  userName,
  onThreadChange,
}: UseInlineCommentsOptions): UseInlineCommentsReturn {
  const [threads, setThreads] = useState<CommentThread[]>([]);
  const [activeThreadId, setActiveThread] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const threadsRef = useRef(threads);
  threadsRef.current = threads;

  const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const getThreadForAnchor = useCallback((anchor: CommentThread['anchor']) => {
    return threadsRef.current.find(t => 
      t.anchor.startOffset === anchor.startOffset &&
      t.anchor.endOffset === anchor.endOffset &&
      t.anchor.segmentId === anchor.segmentId
    );
  }, []);

  const createThread = useCallback(async (
    anchor: CommentThread['anchor'],
    initialComment: string
  ): Promise<CommentThread> => {
    setIsLoading(true);
    try {
      const existing = getThreadForAnchor(anchor);
      if (existing) {
        const newComment: Comment = {
          id: generateId(),
          threadId: existing.id,
          userId,
          userName,
          role,
          content: initialComment,
          createdAt: new Date(),
        };
        
        const updatedThread = {
          ...existing,
          comments: [...existing.comments, newComment],
          updatedAt: new Date(),
        };
        
        setThreads(prev => prev.map(t => t.id === existing.id ? updatedThread : t));
        onThreadChange?.(threadsRef.current.map(t => t.id === existing.id ? updatedThread : t));
        return updatedThread;
      }

      const newThread: CommentThread = {
        id: generateId(),
        sessionId,
        documentId: '',
        pageId: '',
        anchor,
        comments: [{
          id: generateId(),
          threadId: '',
          userId,
          userName,
          role,
          content: initialComment,
          createdAt: new Date(),
        }],
        status: 'open',
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      newThread.comments[0].threadId = newThread.id;

      setThreads(prev => [...prev, newThread]);
      onThreadChange?.([...threadsRef.current, newThread]);
      
      return newThread;
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, role, userId, userName, getThreadForAnchor, onThreadChange]);

  const addComment = useCallback(async (
    threadId: string,
    content: string
  ): Promise<Comment> => {
    setIsLoading(true);
    try {
      const newComment: Comment = {
        id: generateId(),
        threadId,
        userId,
        userName,
        role,
        content,
        createdAt: new Date(),
      };

      setThreads(prev => prev.map(thread => {
        if (thread.id === threadId) {
          return {
            ...thread,
            comments: [...thread.comments, newComment],
            updatedAt: new Date(),
          };
        }
        return thread;
      }));

      onThreadChange?.(threadsRef.current.map(thread => 
        thread.id === threadId 
          ? { ...thread, comments: [...thread.comments, newComment], updatedAt: new Date() }
          : thread
      ));

      return newComment;
    } finally {
      setIsLoading(false);
    }
  }, [onThreadChange]);

  const resolveThread = useCallback(async (threadId: string) => {
    setIsLoading(true);
    try {
      setThreads(prev => prev.map(thread => 
        thread.id === threadId 
          ? { ...thread, status: 'resolved' as const, updatedAt: new Date() }
          : thread
      ));
      onThreadChange?.(threadsRef.current.map(thread => 
        thread.id === threadId 
          ? { ...thread, status: 'resolved' as const, updatedAt: new Date() }
          : thread
      ));
    } finally {
      setIsLoading(false);
    }
  }, [onThreadChange]);

  const reopenThread = useCallback(async (threadId: string) => {
    setIsLoading(true);
    try {
      setThreads(prev => prev.map(thread => 
        thread.id === threadId 
          ? { ...thread, status: 'open' as const, updatedAt: new Date() }
          : thread
      ));
      onThreadChange?.(threadsRef.current.map(thread => 
        thread.id === threadId 
          ? { ...thread, status: 'open' as const, updatedAt: new Date() }
          : thread
      ));
    } finally {
      setIsLoading(false);
    }
  }, [onThreadChange]);

  const deleteThread = useCallback(async (threadId: string) => {
    if (role !== 'shop') {
      throw new Error('Only shop operators can delete comment threads');
    }

    setIsLoading(true);
    try {
      setThreads(prev => prev.filter(thread => thread.id !== threadId));
      onThreadChange?.(threadsRef.current.filter(thread => thread.id !== threadId));
      
      if (activeThreadId === threadId) {
        setActiveThread(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, [role, activeThreadId, onThreadChange]);

  return {
    threads,
    activeThreadId,
    isLoading,
    createThread,
    addComment,
    resolveThread,
    reopenThread,
    deleteThread,
    setActiveThread,
    getThreadForAnchor,
  };
}