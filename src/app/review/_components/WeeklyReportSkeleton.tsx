/**
 * WeeklyReportSkeleton — skeleton loading cho S13 (design.md §4.13).
 *
 * Xem tasks.md 15.1.
 */

import { Card, CardHeader } from "@/components/ui/Card";
import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";

export function WeeklyReportSkeleton() {
  return (
    <div className="space-y-gutter-lg">
      {/* KPI row skeleton */}
      <div className="grid grid-cols-1 gap-gutter sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} tone="base">
            <CardHeader title={<SkeletonText className="h-4 w-32" />} />
            <div className="p-gutter">
              <SkeletonText className="h-7 w-24" />
              <SkeletonText className="mt-1 h-3 w-20" />
            </div>
          </Card>
        ))}
      </div>

      {/* Domain distribution skeleton */}
      <Card tone="base">
        <CardHeader title={<SkeletonText className="h-5 w-48" />} />
        <div className="p-gutter space-y-space-md">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-space-xs">
              <div className="flex items-center justify-between">
                <SkeletonText className="h-4 w-32" />
                <SkeletonText className="h-4 w-16" />
              </div>
              <Skeleton className="h-2 w-full" />
            </div>
          ))}
        </div>
      </Card>

      {/* Top skills skeleton */}
      <Card tone="base">
        <CardHeader title={<SkeletonText className="h-5 w-40" />} />
        <div className="p-gutter">
          <div className="grid gap-space-md sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </div>
      </Card>

      {/* Insights skeleton */}
      <Card tone="base">
        <CardHeader title={<SkeletonText className="h-5 w-36" />} />
        <div className="p-gutter space-y-gutter-md">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </Card>

      {/* Plan proposal skeleton */}
      <Card tone="base">
        <CardHeader title={<SkeletonText className="h-5 w-48" />} />
        <div className="p-gutter space-y-space-md">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </Card>
    </div>
  );
}
