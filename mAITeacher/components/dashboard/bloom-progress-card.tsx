"use client";
import * as React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BloomLevelChart } from "@/components/charts/bloom-level-chart";
import { subjects } from "@/lib/mock-data/subjects";

export function BloomProgressCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bloom&apos;s Taxonomy Progress</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={subjects[0].id}>
          <TabsList className="mb-5 flex-wrap">
            {subjects.map((s) => (
              <TabsTrigger key={s.id} value={s.id}>
                {s.name}
              </TabsTrigger>
            ))}
          </TabsList>
          {subjects.map((s) => (
            <TabsContent key={s.id} value={s.id}>
              <BloomLevelChart currentLevel={s.currentBloomLevel} />
              <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                Next up: <span className="font-medium text-gray-700 dark:text-gray-200">{s.nextTopic}</span>
              </p>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
