import type { ReactNode } from "react";

export interface ResponsiveColumn<T> {
  label: string;
  cell: (row: T) => ReactNode;
  hideOnMobile?: boolean;
  align?: "left" | "right" | "center";
}

interface ResponsiveTableProps<T> {
  columns: ResponsiveColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  mobileTitle?: (row: T) => ReactNode;
  mobileTrailing?: (row: T) => ReactNode;
  onRowClick?: (row: T) => void;
  emptyState?: ReactNode;
}

export function ResponsiveTable<T>({
  columns,
  rows,
  rowKey,
  mobileTitle,
  mobileTrailing,
  onRowClick,
  emptyState,
}: ResponsiveTableProps<T>) {
  if (!rows.length) {
    return (
      <div className="border-2 border-dashed border-ink/30 rounded-lg p-8 text-center text-sm text-fog">
        {emptyState || "No items yet."}
      </div>
    );
  }

  const mobileCols = columns.filter((c) => !c.hideOnMobile);

  return (
    <>
      <div className="hidden md:block border-2 border-ink rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink text-paper">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.label}
                  className="text-left px-4 py-3 text-[10px] font-bold tracking-editorial uppercase"
                  style={{ textAlign: c.align || "left" }}
                >
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
                className={`border-t-2 border-ink/15 ${
                  onRowClick ? "cursor-pointer hover:bg-paper-warm" : ""
                }`}
              >
                {columns.map((c) => (
                  <td
                    key={c.label}
                    className="px-4 py-3 align-middle"
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
                className={`w-full text-left border-2 border-ink rounded-lg bg-paper-light p-4 transition-all ${
                  onRowClick ? "hover:shadow-[3px_3px_0_#1A1410] active:shadow-none" : ""
                }`}
              >
                {(mobileTitle || mobileTrailing) && (
                  <div className="flex items-start justify-between gap-3 mb-2 pb-2 border-b border-ink/10">
                    <div className="font-bold text-base flex-1 min-w-0 truncate">
                      {mobileTitle ? mobileTitle(row) : mobileCols[0]?.cell(row)}
                    </div>
                    {mobileTrailing && <div className="flex-shrink-0">{mobileTrailing(row)}</div>}
                  </div>
                )}
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
