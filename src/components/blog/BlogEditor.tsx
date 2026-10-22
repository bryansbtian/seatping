import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft02Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  blogCategoryColors,
  blogCoverAlt,
  blogSlug,
  readingMinutes,
  type BlogFields,
  type BlogPost,
} from "@shared/blog";
import { blogRequest, uploadBlogMedia } from "@/lib/blogApi";
import { useBlogAutosave, errorMessage } from "@/hooks/useBlogAutosave";
import RichTextEditor from "./RichTextEditor";
import UploadProgress from "./UploadProgress";
import CanvasTextarea from "./CanvasTextarea";
import BlogEditorLoading from "./BlogEditorLoading";

export default function BlogEditor({ id }: { id: string }) {
  const [post, setPost] = useState<BlogPost | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const navigate = useNavigate();
  const creation = useRef<Promise<{ post: BlogPost }> | null>(null);
  useEffect(() => {
    let active = true;
    setError("");
    setPost(null);
    let request: Promise<{ post: BlogPost }>;
    if (id === "new") {
      if (!creation.current) {
        creation.current = blogRequest("", "POST", {});
      }
      request = creation.current;
    } else {
      request = blogRequest(`/${encodeURIComponent(id)}`);
    }
    request
      .then(({ post }) => {
        if (!active) {
          return;
        }
        if (id === "new") {
          navigate(`/admin/blog/${post.id}/edit`, { replace: true });
        } else {
          setPost(post);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(errorMessage(cause));
          creation.current = null;
        }
      });
    return () => {
      active = false;
    };
  }, [id, navigate, attempt]);
  if (error) {
    return (
      <div role="alert" className="rounded-xl border bg-white p-8">
        <p>{error}</p>
        <Button variant="outline" className="mt-4" onClick={() => setAttempt((value) => value + 1)}>
          Retry
        </Button>
      </div>
    );
  }
  if (!post) {
    return <BlogEditorLoading />;
  }
  return <EditorForm key={post.id} initial={post} />;
}

function EditorForm({ initial }: { initial: BlogPost }) {
  const [preview, setPreview] = useState(false);
  const [validContent, setValidContent] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [tagError, setTagError] = useState("");
  const [publishDialog, setPublishDialog] = useState(false);
  const [leaveTo, setLeaveTo] = useState("");
  const [editorVersion, setEditorVersion] = useState(0);
  const coverInput = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const form = useBlogAutosave(initial, uploading || busy || !validContent);
  const { fields, post, change } = form;
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  function addTags() {
    const added = tagDraft
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    if (!added.length) {
      setTagDraft("");
      return;
    }
    const tags = Array.from(new Set([...fieldsRef.current.tags, ...added]));
    if (tags.length > 20 || tags.some((tag) => tag.length > 50)) {
      setTagError("Use up to 20 tags, with no more than 50 characters each.");
      return;
    }
    update("tags", tags);
    setTagDraft("");
    setTagError("");
  }
  function update<K extends keyof BlogFields>(key: K, value: BlogFields[K]) {
    change({ ...fieldsRef.current, [key]: value });
  }
  useEffect(() => {
    const intercept = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const link = target.closest("a[href]");
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.origin !== window.location.origin ||
        link.pathname === window.location.pathname ||
        event.metaKey ||
        event.ctrlKey
      ) {
        return;
      }
      if (form.dirty || uploading) {
        event.preventDefault();
        event.stopPropagation();
        setLeaveTo(link.pathname + link.search);
      }
    };
    document.addEventListener("click", intercept, true);
    return () => document.removeEventListener("click", intercept, true);
  }, [form.dirty, uploading]);
  async function save(status?: "DRAFT" | "PUBLISHED") {
    if (!validContent || uploading) {
      setError("Resolve the article content error or finish the upload before saving.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const saved = await form.save();
      if (status && status !== saved.status) {
        const result = await blogRequest<{ post: BlogPost }>(`/${saved.id}/status`, "POST", {
          status,
          revision: saved.revision,
        });
        form.acceptPost(result.post);
      }
      setPublishDialog(false);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function cover(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Choose an image for the cover.");
      return;
    }
    setUploading(true);
    setProgress(0);
    setError("");
    try {
      const url = await uploadBlogMedia(file, setProgress);
      change({ ...fieldsRef.current, coverUrl: url, coverAlt: blogCoverAlt(file.name) });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setUploading(false);
      setProgress(null);
    }
  }
  let statusLabel = "Draft";
  let statusTone: "neutral" | "success" = "neutral";
  let actionLabel = "Publish";
  let targetStatus: "DRAFT" | "PUBLISHED" = "PUBLISHED";
  if (post.status === "PUBLISHED") {
    statusLabel = "Published";
    statusTone = "success";
    actionLabel = "Unpublish";
    targetStatus = "DRAFT";
  }
  let saveLabel = `Saved ${new Date(post.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  if (form.dirty) {
    saveLabel = "Unsaved Changes";
  }
  if (form.saving) {
    saveLabel = "Saving…";
  }
  if (form.error) {
    saveLabel = "Save Failed";
  }
  let previewLabel = "Preview";
  if (preview) {
    previewLabel = "Continue Editing";
  }
  const disabled = busy || uploading || !validContent || form.saving || Boolean(form.recovery);
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3.5 justify-self-start sm:ml-0"
          onClick={() => {
            if (form.dirty || uploading) {
              setLeaveTo("/admin/blog");
            } else {
              navigate("/admin/blog");
            }
          }}
        >
          <HugeiconsIcon icon={ArrowLeft02Icon} className="size-4" aria-hidden="true" />
          Back To Posts
        </Button>
        <div className="flex items-center justify-between gap-2 sm:ml-auto sm:justify-start">
          <span role="status" className="text-caption text-ink-subtle">
            {saveLabel}
          </span>
          <Badge variant={statusTone}>{statusLabel}</Badge>
        </div>
        <div className="grid min-w-0 grid-cols-3 gap-2 sm:flex sm:items-center">
          <Button
            variant="outline"
            size="sm"
            className="min-w-0 px-2 sm:px-3"
            disabled={uploading || !validContent}
            onClick={() => setPreview(!preview)}
          >
            <span className="min-w-0 truncate">{previewLabel}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="min-w-0 px-2 sm:px-3"
            disabled={disabled}
            onClick={() => void save("DRAFT")}
          >
            Save Draft
          </Button>
          <Button
            size="sm"
            className="min-w-0 px-2 sm:px-3"
            disabled={disabled}
            onClick={() => setPublishDialog(true)}
          >
            <span className="min-w-0 truncate">{actionLabel}</span>
          </Button>
        </div>
      </div>
      {(error || form.error) && (
        <div
          role="alert"
          className="rounded-control border border-destructive/30 bg-white p-4 text-body text-destructive"
        >
          <p>{error || form.error}</p>
          <p className="mt-1 text-caption">
            Your edits are kept in this tab. Retry saving when the connection is restored. For a
            conflict, copy your changes before reloading.
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={busy || uploading || !validContent}
            className="mt-2"
            onClick={() => void save()}
          >
            Retry Save
          </Button>
        </div>
      )}
      {form.recovery && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-control border bg-white p-4"
        >
          <p className="flex-1 text-body">
            Unsaved edits from this tab are available. Restore them or keep the server version.
          </p>
          <Button
            size="sm"
            onClick={() => {
              form.restore();
              setEditorVersion((value) => value + 1);
            }}
          >
            Restore Edits
          </Button>
          <Button variant="outline" size="sm" onClick={form.discardRecovery}>
            Use Server Version
          </Button>
        </div>
      )}
      <div className="min-w-0">
        <article className="min-w-0 rounded-2xl border bg-white px-4 py-6 shadow-sm sm:px-10 sm:py-10 lg:px-12">
          <div className="mx-auto max-w-4xl">
            <header className="mb-8 space-y-6 sm:mb-12 sm:space-y-8">
              <div className="flex items-center gap-3">
                {preview && (
                  <Badge
                    variant={fields.categoryColor}
                    className="min-w-0 max-w-full leading-normal"
                  >
                    <span className="min-w-0 truncate">{fields.category || "Article"}</span>
                  </Badge>
                )}
                {!preview && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-w-0 max-w-full p-0"
                        aria-label="Edit Category"
                        disabled={busy}
                      >
                        <Badge
                          variant={fields.categoryColor}
                          className="min-w-0 max-w-full leading-normal"
                        >
                          <span className="min-w-0 truncate">
                            {fields.category || "Add Category"}
                          </span>
                        </Badge>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="max-w-[calc(100vw-2rem)] space-y-4 rounded-control"
                    >
                      <div className="space-y-2">
                        <Label htmlFor="blog-category">Category</Label>
                        <Input
                          id="blog-category"
                          value={fields.category}
                          maxLength={80}
                          onChange={(event) => update("category", event.target.value)}
                          placeholder="Category name"
                        />
                      </div>
                      <fieldset className="space-y-2">
                        <legend className="text-label">Pill Color</legend>
                        <div className="flex flex-wrap gap-2">
                          {blogCategoryColors.map((color) => (
                            <Button
                              key={color}
                              variant="ghost"
                              size="sm"
                              className="p-0"
                              aria-label={`Use ${categoryColorLabels[color]} Category Color`}
                              aria-pressed={fields.categoryColor === color}
                              onClick={() => update("categoryColor", color)}
                            >
                              <Badge variant={color}>{categoryColorLabels[color]}</Badge>
                            </Button>
                          ))}
                        </div>
                      </fieldset>
                    </PopoverContent>
                  </Popover>
                )}
                <span className="shrink-0 text-caption text-ink-subtle">
                  {readingMinutes(fields.content)} Min Read
                </span>
              </div>
              {preview && (
                <h1 className="text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl lg:text-5xl">
                  {fields.title || "Untitled Article"}
                </h1>
              )}
              {!preview && (
                <CanvasTextarea
                  aria-label="Article Title"
                  placeholder="Your Article Title"
                  value={fields.title}
                  maxLength={240}
                  disabled={busy}
                  onChange={(event) => {
                    const title = event.target.value;
                    change({ ...fields, title, slug: blogSlug(title) || initial.slug });
                  }}
                  className="min-h-10 rounded-none border-0 p-0 text-3xl font-semibold leading-[1.1] tracking-tight shadow-none focus-visible:ring-0 sm:min-h-12 sm:text-4xl lg:text-5xl"
                />
              )}
              {preview && fields.excerpt && (
                <p className="text-base leading-relaxed text-ink-subtle sm:text-lg lg:text-xl">
                  {fields.excerpt}
                </p>
              )}
              {!preview && (
                <CanvasTextarea
                  aria-label="Excerpt"
                  placeholder="Add a short introduction to your article..."
                  value={fields.excerpt}
                  maxLength={1000}
                  disabled={busy}
                  onChange={(event) => update("excerpt", event.target.value)}
                  className="min-h-7 rounded-none border-0 p-0 text-base leading-relaxed text-ink-subtle shadow-none focus-visible:ring-0 sm:text-lg lg:text-xl"
                />
              )}
              <div className="flex items-center gap-3 text-body sm:gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-100 font-medium">
                  {fields.author.charAt(0) || "S"}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                  {preview && (
                    <p className="break-words font-medium sm:max-w-64">
                      {fields.author || "SeatPing Team"}
                    </p>
                  )}
                  {!preview && (
                    <div className="relative grid min-w-0 w-full sm:w-auto sm:max-w-64">
                      <span
                        aria-hidden="true"
                        className="invisible h-7 overflow-hidden whitespace-pre text-body font-medium"
                      >
                        {fields.author || "Author name"}
                      </span>
                      <Input
                        aria-label="Author"
                        value={fields.author}
                        maxLength={120}
                        disabled={busy}
                        placeholder="Author name"
                        onChange={(event) => update("author", event.target.value)}
                        className="absolute inset-0 h-7 min-w-0 w-full border-0 bg-transparent px-0 text-body font-medium shadow-none"
                      />
                    </div>
                  )}
                  <span aria-hidden="true" className="hidden text-ink-subtle sm:inline">
                    ·
                  </span>
                  <time
                    dateTime={post.publishedAt || post.createdAt}
                    className="shrink-0 text-caption text-ink-subtle"
                  >
                    {new Date(post.publishedAt || post.createdAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </time>
                </div>
              </div>
            </header>
            {fields.coverUrl && (
              <div className="mb-5 space-y-2">
                <img
                  src={fields.coverUrl}
                  alt={fields.coverAlt}
                  className="aspect-[16/9] w-full rounded-xl object-cover"
                />
                {!preview && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={uploading || busy}
                      onClick={() => coverInput.current?.click()}
                    >
                      Change Cover
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={uploading || busy}
                      onClick={() => change({ ...fieldsRef.current, coverUrl: "", coverAlt: "" })}
                    >
                      Remove Cover
                    </Button>
                  </div>
                )}
              </div>
            )}
            {!fields.coverUrl && !preview && (
              <Button
                type="button"
                variant="outline"
                className="mb-5 w-full border-dashed"
                disabled={uploading}
                onClick={() => coverInput.current?.click()}
              >
                Add Cover Image
              </Button>
            )}
            {!preview && (
              <input
                ref={coverInput}
                aria-label="Upload Cover Image"
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void cover(file);
                  }
                  event.target.value = "";
                }}
              />
            )}
            {progress !== null && (
              <div className="mb-5">
                <UploadProgress label="Uploading Cover" value={progress} />
              </div>
            )}
            <RichTextEditor
              key={`${editorVersion}-${preview}`}
              content={fields.content}
              readOnly={preview}
              onUploading={setUploading}
              onValidityChange={setValidContent}
              onChange={(content) => update("content", content)}
            />
            {(fields.tags.length > 0 || !preview) && (
              <div className="mt-6 space-y-3 border-t pt-5" role="group" aria-label="Article Tags">
                <p className="text-label text-ink-subtle">Tags</p>
                <div className="flex flex-wrap items-center gap-2">
                  {fields.tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="neutral"
                      className="min-w-0 max-w-full leading-normal"
                    >
                      <span className="min-w-0 truncate">{tag}</span>
                      {!preview && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="-mr-1 size-4 min-h-0 rounded-sm p-0"
                          aria-label={`Remove Tag ${tag}`}
                          disabled={busy}
                          onClick={() =>
                            update(
                              "tags",
                              fieldsRef.current.tags.filter((value) => value !== tag),
                            )
                          }
                        >
                          <HugeiconsIcon
                            icon={Cancel01Icon}
                            className="size-3"
                            aria-hidden="true"
                          />
                        </Button>
                      )}
                    </Badge>
                  ))}
                </div>
                {!preview && (
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Input
                      aria-label="Add Tag"
                      aria-invalid={Boolean(tagError)}
                      aria-describedby="tag-help"
                      placeholder="Add a tag..."
                      value={tagDraft}
                      maxLength={1020}
                      disabled={busy}
                      onChange={(event) => {
                        setTagDraft(event.target.value);
                        setTagError("");
                      }}
                      onBlur={addTags}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === ",") {
                          event.preventDefault();
                          addTags();
                        }
                      }}
                      className="min-w-0 flex-1"
                    />
                    <Button
                      variant="outline"
                      disabled={busy || !tagDraft.trim()}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={addTags}
                    >
                      Add Tag
                    </Button>
                  </div>
                )}
                {!preview && (
                  <p id="tag-help" className="text-caption text-ink-subtle">
                    Press Enter or comma to add a tag. Up to 20 tags.
                  </p>
                )}
                {tagError && (
                  <p role="alert" className="text-caption text-destructive">
                    {tagError}
                  </p>
                )}
              </div>
            )}
          </div>
        </article>
      </div>
      <Dialog open={publishDialog} onOpenChange={setPublishDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{actionLabel} Article?</DialogTitle>
            <DialogDescription>{publicationDescription(targetStatus)}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishDialog(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void save(targetStatus)} disabled={disabled}>
              {actionLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(leaveTo)}
        onOpenChange={(open) => {
          if (!open) {
            setLeaveTo("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave With Unsaved Changes?</DialogTitle>
            <DialogDescription>
              Your latest edits have not been saved to the server. A recovery copy will remain in
              this tab.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeaveTo("")}>
              Keep Editing
            </Button>
            <Button
              disabled={uploading || busy || !validContent}
              onClick={async () => {
                try {
                  await form.save();
                  navigate(leaveTo);
                } catch {}
              }}
            >
              Save And Leave
            </Button>
            <Button variant="destructive" onClick={() => navigate(leaveTo)}>
              Leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
const categoryColorLabels = {
  info: "Blue",
  success: "Green",
  warning: "Amber",
  danger: "Red",
  neutral: "Slate",
};

function publicationDescription(status: string) {
  if (status === "DRAFT") {
    return "Move this article back to Draft. You can publish it again later.";
  }
  return "Save your latest edits and mark this article as Published. Public blog pages are not enabled yet.";
}
