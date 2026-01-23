export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export function getPaginationParams(
  page: number = 1,
  limit: number = 20,
): { skip: number; take: number } {
  const validPage = Math.max(1, page);
  const validLimit = Math.min(100, Math.max(1, limit));

  return {
    skip: (validPage - 1) * validLimit,
    take: validLimit,
  };
}

export function createPaginatedResult<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResult<T> {
  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}
