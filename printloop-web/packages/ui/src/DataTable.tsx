import type { ReactNode } from "react";
import { cx } from "./cx";

export interface Column<T> {
  label: string;
  cell: (row: T) => ReactNode;
  hideOnMobile?: boolean;
  align?: "left" | "right" | "center";
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  mobileTitle?: (row: T) => ReactNode;
  mobileTrailing?: (row: T) => ReactNode;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  caption?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  mobileTitle,
  mobileTrailing,
  onRowClick,
  empty,
  caption,
}: DataTableProps<T>) {
  if (!rows.length) {
    return (
      <div className="border-2 border-dashed border-ink/30 rounded-lg p-8 text-center text-sm text-fog">
        {empty || "Nothing here yet."}
      </div>
    );
  }

  const mobileCols = columns.filter((c) => !c.hideOnMobile);

  return (
    <>
      <div className="hidden md:block border-2 border-ink rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead className="bg-ink text-paper">
            <tr>
              {columns.map((c) => (
                <th key={c.label} scope="col" className="pl-table-head" style={{ textAlign: c.align || "left" }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === "Enter") onRowClick(row);
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
                className={cx(
                  "border-t-2 border-ink/15",
                  onRowClick && "cursor-pointer hover:bg-paper-warm focus:bg-paper-warm outline-none",
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.label}
                    className={cx("px-4 py-3 align-middle", c.className)}
                    style={{ textAlign: c.align || "left" }}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="md:hidden flex flex-col gap-3">
        {rows.map((row) => {
          const Wrapper = onRowClick ? "button" : "div";
          return (
            <li key={rowKey(row)}>
              <Wrapper
                {...(onRowClick ? { onClick: () => onRowClick(row), type: "button" as const } : {})}
                className={cx(
                  "w-full text-left border-2 border-ink rounded-lg bg-paper-light p-4 transition-all",
                  onRowClick && "hover:shadow-brutal-sm active:shadow-none",
                )}
              >
                {mobileTitle || mobileTrailing ? (
                  <div className="flex items-start justify-between gap-3 mb-2 pb-2 border-b border-ink/10">
                    <div className="font-bold text-base flex-1 min-w-0 truncate">
                      {mobileTitle ? mobileTitle(row) : mobileCols[0]?.cell(row)}
                    </div>
                    {mobileTrailing ? <div className="flex-shrink-0">{mobileTrailing(row)}</div> : null}
                  </div>
                ) : null}
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
                  {mobileCols.map((c) => (
                    <div key={c.label} className="contents">
                      <dt className="text-[10px] font-bold tracking-editorial uppercase text-fog self-center">
                        {c.label}
                      </dt>
                      <dd className="text-ink break-words">{c.cell(row)}</dd>
                    </div>
                  ))}
                </dl>
              </Wrapper>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function Pagination({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (page: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <nav className="flex items-center justify-between mt-4" aria-label="Pagination">
      <button
        type="button"
        className="pl-btn-ghost pl-btn-sm"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        ← Prev
      </button>
      <span className="pl-mono text-xs text-ink/60">
        Page {page} of {pages}
      </span>
      <button
        type="button"
        className="pl-btn-ghost pl-btn-sm"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        Next →
      </button>
    </nav>
  );
}
