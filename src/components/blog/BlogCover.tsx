import { blogCoverThumbnail, isBlogCoverVideo } from "@shared/blogMedia";

export default function BlogCover({
  url,
  alt,
  readOnly,
  disabled,
  onRemove,
}: {
  url: string;
  alt: string;
  readOnly: boolean;
  disabled: boolean;
  onRemove: () => void;
}) {
  const editable = !readOnly && !disabled;
  if (!editable) {
    if (isBlogCoverVideo(url)) {
      return (
        <video
          src={url}
          poster={blogCoverThumbnail(url)}
          aria-label={alt || "Cover Video"}
          controls
          preload="metadata"
          className="mb-6 aspect-[16/9] w-full rounded-xl bg-slate-900"
        />
      );
    }
    return (
      <img src={url} alt={alt} className="mb-6 aspect-[16/9] w-full rounded-xl object-cover" />
    );
  }
  return (
    <div className="mb-6">
      <div
        role="textbox"
        aria-label="Cover Image"
        aria-describedby="cover-image-help"
        tabIndex={0}
        contentEditable
        suppressContentEditableWarning
        className="min-w-0 rounded-xl caret-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={(event) => {
          const range = document.createRange();
          range.selectNodeContents(event.currentTarget);
          range.collapse(false);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
        }}
        onKeyDown={(event) => {
          if (["Backspace", "Delete"].includes(event.key)) {
            event.preventDefault();
            onRemove();
          } else if (
            event.key === "Enter" ||
            (event.key.length === 1 && !event.metaKey && !event.ctrlKey)
          ) {
            event.preventDefault();
          }
        }}
        onBeforeInput={(event) => {
          event.preventDefault();
          const input = event.nativeEvent as InputEvent;
          if (["deleteContentBackward", "deleteContentForward"].includes(input.inputType)) {
            onRemove();
          }
        }}
        onPaste={(event) => event.preventDefault()}
        onDrop={(event) => event.preventDefault()}
      >
        <img
          src={blogCoverThumbnail(url)}
          alt={alt}
          contentEditable={false}
          draggable={false}
          className="inline-block aspect-[16/9] w-[calc(100%-2px)] rounded-xl object-cover align-bottom"
        />
        {"\u200b"}
      </div>
      <span id="cover-image-help" className="sr-only">
        Press Backspace Or Delete To Remove The Cover Image.
      </span>
    </div>
  );
}
