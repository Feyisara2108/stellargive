"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface BreadcrumbItem {
  label: string;
  href: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 max-w-full">
      <ol className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const truncatedLabel =
            item.label.length > 40 ? `${item.label.slice(0, 40)}...` : item.label;
          const labelClassName = "min-w-0 max-w-[9rem] sm:max-w-[12rem] md:max-w-[16rem] truncate";

          return (
            <li key={item.href} className="flex min-w-0 items-center gap-2">
              {!isLast ? (
                <>
                  <Link
                    href={item.href}
                    className={`min-w-0 hover:text-primary transition-colors ${labelClassName}`}
                    aria-label={`Navigate to ${item.label}`}
                    title={item.label}
                  >
                    {truncatedLabel}
                  </Link>
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                </>
              ) : (
                <span
                  className={`min-w-0 text-foreground font-medium ${labelClassName}`}
                  aria-current="page"
                  title={item.label}
                >
                  {truncatedLabel}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
