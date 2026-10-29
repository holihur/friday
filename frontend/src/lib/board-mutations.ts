import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import i18n from "@/i18n"
import { api, ApiError } from "@/lib/api"
import type { Board, BoardPayload, Column, Comment, Group, Item } from "@/lib/types"

export interface UpdateItemPatch {
  id: string
  name?: string
  values?: Record<string, unknown>
  groupId?: string
  position?: number
}

function errorMessage(err: unknown, fallback: string) {
  return i18n.t(err instanceof ApiError ? err.message : fallback)
}

export function useBoardMutations(boardId: string) {
  const queryClient = useQueryClient()
  const boardKey = ["board", boardId]

  const patchBoardCache = (updater: (old: BoardPayload) => BoardPayload) => {
    queryClient.setQueryData<BoardPayload>(boardKey, (old) => (old ? updater(old) : old))
  }

  const invalidateBoard = () => queryClient.invalidateQueries({ queryKey: boardKey })
  const invalidateLists = () => {
    void queryClient.invalidateQueries({ queryKey: ["boards"] })
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    void queryClient.invalidateQueries({ queryKey: ["my-items"] })
  }

  const updateItem = useMutation({
    mutationFn: ({ id, ...patch }: UpdateItemPatch) => api.patch<{ item: Item }>(`/items/${id}`, patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: boardKey })
      const previous = queryClient.getQueryData<BoardPayload>(boardKey)
      patchBoardCache((old) => ({
        ...old,
        items: old.items.map((item) => {
          if (item.id !== patch.id) return item
          return {
            ...item,
            ...(patch.name !== undefined ? { name: patch.name } : {}),
            ...(patch.groupId !== undefined ? { groupId: patch.groupId } : {}),
            ...(patch.position !== undefined ? { position: patch.position } : {}),
            ...(patch.values ? { values: { ...item.values, ...patch.values } } : {}),
          }
        }),
      }))
      return { previous }
    },
    onError: (err, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(boardKey, context.previous)
      toast.error(errorMessage(err, "Could not update item"))
    },
    onSuccess: ({ item }) => {
      patchBoardCache((old) => ({ ...old, items: old.items.map((existing) => (existing.id === item.id ? item : existing)) }))
    },
    onSettled: () => {
      void invalidateBoard()
      invalidateLists()
    },
  })

  const createItem = useMutation({
    mutationFn: ({ groupId, name }: { groupId: string; name: string }) =>
      api.post<{ item: Item }>(`/boards/${boardId}/items`, { groupId, name }),
    onSuccess: ({ item }) => {
      patchBoardCache((old) => ({ ...old, items: [...old.items, item] }))
      void invalidateBoard()
      invalidateLists()
    },
    onError: (err) => toast.error(errorMessage(err, "Could not create item")),
  })

  const deleteItem = useMutation({
    mutationFn: (id: string) => api.delete(`/items/${id}`),
    onSuccess: (_data, id) => {
      patchBoardCache((old) => ({ ...old, items: old.items.filter((item) => item.id !== id) }))
      void invalidateBoard()
      invalidateLists()
      toast.success(i18n.t("Item deleted"))
    },
    onError: (err) => toast.error(errorMessage(err, "Could not delete item")),
  })

  const createGroup = useMutation({
    mutationFn: (input: { title: string; color: string }) =>
      api.post<{ group: Group }>(`/boards/${boardId}/groups`, input),
    onSuccess: () => {
      void invalidateBoard()
      invalidateLists()
    },
    onError: (err) => toast.error(errorMessage(err, "Could not create group")),
  })

  const updateGroup = useMutation({
    mutationFn: ({ id, ...patch }: { id: string; title?: string; color?: string; collapsed?: boolean; position?: number }) =>
      api.patch<{ group: Group }>(`/groups/${id}`, patch),
    onSuccess: ({ group }) => {
      patchBoardCache((old) => ({ ...old, groups: old.groups.map((g) => (g.id === group.id ? group : g)) }))
      void invalidateBoard()
    },
    onError: (err) => toast.error(errorMessage(err, "Could not update group")),
  })

  const deleteGroup = useMutation({
    mutationFn: (id: string) => api.delete(`/groups/${id}`),
    onSuccess: () => {
      void invalidateBoard()
      invalidateLists()
      toast.success(i18n.t("Group deleted"))
    },
    onError: (err) => toast.error(errorMessage(err, "Could not delete group")),
  })

  const createColumn = useMutation({
    mutationFn: (input: { title: string; type: string }) =>
      api.post<{ board: Board; column: Column }>(`/boards/${boardId}/columns`, input),
    onSuccess: ({ board }) => {
      patchBoardCache((old) => ({ ...old, board }))
      invalidateLists()
    },
    onError: (err) => toast.error(errorMessage(err, "Could not add column")),
  })

  const updateColumn = useMutation({
    mutationFn: ({ columnId, ...patch }: { columnId: string; title?: string; width?: number }) =>
      api.patch<{ board: Board }>(`/boards/${boardId}/columns/${columnId}`, patch),
    onSuccess: ({ board }) => {
      patchBoardCache((old) => ({ ...old, board }))
    },
    onError: (err) => toast.error(errorMessage(err, "Could not update column")),
  })

  const deleteColumn = useMutation({
    mutationFn: (columnId: string) => api.delete<{ board: Board }>(`/boards/${boardId}/columns/${columnId}`),
    onSuccess: ({ board }) => {
      patchBoardCache((old) => ({
        ...old,
        board,
        items: old.items.map((item) => {
          const values = { ...item.values }
          for (const key of Object.keys(values)) {
            if (!board.columns.some((col) => col.id === key)) delete values[key]
          }
          return { ...item, values }
        }),
      }))
    },
    onError: (err) => toast.error(errorMessage(err, "Could not delete column")),
  })

  const updateBoard = useMutation({
    mutationFn: (patch: { name?: string; description?: string; color?: string; icon?: string; visibility?: "workspace" | "private" }) =>
      api.patch<{ board: Board }>(`/boards/${boardId}`, patch),
    onSuccess: ({ board }) => {
      patchBoardCache((old) => ({ ...old, board }))
      void queryClient.invalidateQueries({ queryKey: ["boards"] })
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    },
    onError: (err) => toast.error(errorMessage(err, "Could not update board")),
  })

  const deleteBoard = useMutation({
    mutationFn: () => api.delete(`/boards/${boardId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["boards"] })
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      toast.success(i18n.t("Board deleted"))
    },
    onError: (err) => toast.error(errorMessage(err, "Could not delete board")),
  })

  const createComment = useMutation({
    mutationFn: ({ itemId, body }: { itemId: string; body: string }) =>
      api.post<{ comment: Comment }>(`/items/${itemId}/comments`, { body }),
    onSuccess: ({ comment }) => {
      void queryClient.invalidateQueries({ queryKey: ["comments", comment.itemId] })
      void invalidateBoard()
    },
    onError: (err) => toast.error(errorMessage(err, "Could not add comment")),
  })

  const deleteComment = useMutation({
    mutationFn: ({ id }: { id: string; itemId: string }) => api.delete(`/comments/${id}`),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["comments", variables.itemId] })
      void invalidateBoard()
    },
    onError: (err) => toast.error(errorMessage(err, "Could not delete comment")),
  })

  return {
    updateItem,
    createItem,
    deleteItem,
    createGroup,
    updateGroup,
    deleteGroup,
    createColumn,
    updateColumn,
    deleteColumn,
    updateBoard,
    deleteBoard,
    createComment,
    deleteComment,
  }
}
