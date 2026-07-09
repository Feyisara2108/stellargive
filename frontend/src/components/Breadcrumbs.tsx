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
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex items-center gap-2 text-sm text-muted-foreground">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const truncatedLabel =
            item.label.length > 40 ? `${item.label.slice(0, 40)}...` : item.label;

          return (
            <li key={item.href} className="flex items-center gap-2">
              {!isLast ? (
                <>
                  <Link
                    href={item.href}
                    className="hover:text-primary transition-colors"
                    aria-label={`Navigate to ${item.label}`}
                  >
                    {truncatedLabel}
                  </Link>
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                </>
              ) : (
                <span className="text-foreground font-medium" aria-current="page">
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
