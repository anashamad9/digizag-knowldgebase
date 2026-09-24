import { FileIcon } from "./file-icon";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Tabs, TabsList, TabsTab } from "./ui/tabs";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "./ui/table";
import { Icon } from "./icon";
import { SourceIcon } from "./source-icon";
import { memoryDate } from "@/lib/memory-date";
import { sourceName } from "@/lib/view";
import type { BrainState } from "@/hooks/use-brain";
export function Data({ brain: b }: { brain: BrainState }) {
  return (
    <section
      aria-label="Memory"
      className="mx-auto w-full max-w-3xl p-4 sm:p-6"
    >
      <div className="mb-4 flex items-center gap-2">
        <Input
          size="sm"
          type="search"
          value={b.query}
          onChange={(e) => b.setQuery(e.target.value)}
          placeholder="Search memory…"
          aria-label="Search memory"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => b.fileRef.current?.click()}
          disabled={b.uploading}
          loading={b.uploading}
        >
          <Icon name="plus" size={14} />
          Upload
        </Button>
        <Button
          size="icon-sm"
          variant="outline"
          aria-label="Upload folder"
          title="Upload folder"
          disabled={b.uploading}
          onClick={() => b.folderRef.current?.click()}
        >
          <Icon name="folder" size={14} />
        </Button>
      </div>
      <Tabs value={b.filter} onValueChange={(v) => b.setFilter(String(v))}>
        <div className="mb-3 overflow-x-auto">
          <TabsList size="sm">
            {[
              ["all", "All"],
              ["note", "Notes"],
              ["file", "Files"],
              ["gmail", "Gmail"],
              ["pumble", "Pumble"],
            ].map(([value, label]) => (
              <TabsTab key={value} value={value}>
                {(value === "gmail" || value === "pumble") && (
                  <SourceIcon source={value} size={14} />
                )}
                {label}
              </TabsTab>
            ))}
          </TabsList>
        </div>
      </Tabs>
      {b.shown.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Source</TableHead>
              <TableHead>Access</TableHead>
              <TableHead>
                {b.filter === "gmail" || b.filter === "pumble"
                  ? "Sent"
                  : "Date"}
              </TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {b.shown.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="max-w-44 sm:max-w-80">
                  <Button
                    size="xs"
                    variant="ghost"
                    className="max-w-full justify-start"
                    loading={b.memoryBusy === m.id}
                    onClick={() => void b.openMemory(m)}
                  >
                    {m.source === "file" ? (
                      <FileIcon name={String(m.metadata.filename || m.title)} />
                    ) : (
                      <SourceIcon source={m.source} size={16} />
                    )}
                    <span className="truncate">{m.title}</span>
                  </Button>
                </TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">
                  {sourceName[m.source]}{" "}
                  {m.source === "file" && m.metadata.indexed === false && (
                    <Badge size="sm" variant="warning">
                      Stored only
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    size="sm"
                    variant={m.visibility === "workspace" ? "info" : "warning"}
                  >
                    {m.visibility === "workspace" ? "Team" : "Only me"}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {memoryDate(m) ? (
                    <time
                      dateTime={memoryDate(m)!}
                      title={`${m.source === "gmail" || m.source === "pumble" ? "Sent" : "Added"}: ${new Date(memoryDate(m)!).toLocaleString(undefined, { timeZoneName: "short" })}`}
                    >
                      <span className="block">
                        {new Date(memoryDate(m)!).toLocaleDateString(
                          undefined,
                          { year: "numeric", month: "short", day: "numeric" },
                        )}
                      </span>
                      <span className="block text-xs">
                        {new Date(memoryDate(m)!).toLocaleTimeString(
                          undefined,
                          {
                            hour: "numeric",
                            minute: "2-digit",
                            timeZoneName: "short",
                          },
                        )}
                      </span>
                    </time>
                  ) : (
                    "Date unavailable"
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    {!!m.metadata.storage_path && (
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        render={<a href={`/api/files/${m.id}`} />}
                        aria-label={`Download ${m.title}`}
                      >
                        <Icon name="down" size={14} />
                      </Button>
                    )}
                    {m.owner_id === b.userId && (
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        className="text-destructive-foreground"
                        aria-label={`Delete ${m.title}`}
                        disabled={b.busy || b.uploading}
                        onClick={() =>
                          b.setPendingDelete({
                            kind: "memory",
                            id: m.id,
                            title: m.title,
                          })
                        }
                      >
                        <Icon name="delete" size={14} />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="py-12 text-center text-xs text-muted-foreground">
          {b.query ? "No results." : "No memories yet."}
        </p>
      )}
    </section>
  );
}
