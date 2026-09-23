export function normalizePagination(input: NormalizarPaginacionInput): { page: number; pageSize: number } {
  let page = input.page;
  let pageSize = input.pageSize;

  if (page === undefined || isNaN(page) || page < 1 || page % 1 !== 0) {
    page = 1;
  }

  if (pageSize === undefined || isNaN(pageSize) || pageSize < 1 || pageSize > 100) {
    pageSize = 20;
  }

  return { page, pageSize };
}