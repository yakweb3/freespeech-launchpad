"use client";
import { useState, useEffect, useRef } from "react";
import StaffPanel from "./staff-panel";
import RichText from "./rich-text";
import VideoEmbed from "./video-embed";
import { useForumTools } from "@/lib/use-forum-tools";
import { threadComments } from "@/lib/comment-threads";
import { Sidebar, SidebarProvider } from "@/components/ui/sidebar";
import { AccountControls, ContactPanel } from "./member-panels";
import { REPORT_REASONS, isRestricted, validId } from "@/lib/forum-validation";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Crown,
  UserRound,
  ArrowUp,
  ArrowDown,
  MessageSquare,
  Search,
  Plus,
  Home,
  Flame,
  Clock,
  Bookmark,
  Users,
  Globe2,
  Cpu,
  Palette,
  Lightbulb,
  ChevronRight,
  Pin,
  Share2,
  ImageIcon,
  Bell,
  Menu,
  Settings,
  LogOut,
  X,
  MoreHorizontal,
  Flag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import {
  preparePicture,
  uploadFile,
  videoThumbnail,
} from "@/lib/client-upload";
import type {
  Media,
  Bootstrap,
  Post,
  Comment,
  Notification,
} from "@/lib/forum-types";
import { POLICIES, RULES } from "@/lib/policies";
const communityExamples = ["PEPE", "DOGE", "SHIB", "BONK", "WIF", "FLOKI", "POPCAT"];
const icons: Record<string, typeof Home> = {
  general: MessageSquare,
  society: Globe2,
  technology: Cpu,
  culture: Palette,
  feedback: Lightbulb,
};
async function api(path: string, data?: unknown) {
  const r = await fetch(
    "/api/forum/" + path,
    data === undefined
      ? {}
      : {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-forum-request": "1",
          },
          body: JSON.stringify(data),
        },
  );
  const value: any = await r.json();
  if (!r.ok) throw new Error(value.error || "Please try again.");
  return value;
}
function ago(time: number) {
  const m = Math.max(1, Math.floor((Date.now() - time) / 60000));
  return m < 60
    ? m + "m"
    : m < 1440
      ? Math.floor(m / 60) + "h"
      : Math.floor(m / 1440) + "d";
}
export default function Forum({
  initial,
  initialPosts,
  initialCategory = "",
}: {
  initial: Bootstrap;
  initialPosts: Post[];
  initialCategory?: string;
}) {
  const [boot, setBoot] = useState(initial),
    [posts, setPosts] = useState(initialPosts),
    [category, setCategory] = useState(initialCategory),
    [filter, setFilter] = useState(""),
    [sort, setSort] = useState("hot"),
    [author, setAuthor] = useState(""),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [next, setNext] = useState<number | null>(null),
    [menu, setMenu] = useState(false);
  const [modal, setModal] = useState(""),
    [detail, setDetail] = useState<Post | null>(null),
    [comments, setComments] = useState<Comment[]>([]),
    [commentsNext, setCommentsNext] = useState<number | null>(null),
    [commentMedia, setCommentMedia] = useState<Media[]>([]),
    [profile, setProfile] = useState<any>(null),
    [comment, setComment] = useState(""),
    [commentId, setCommentId] = useState(() => crypto.randomUUID()),
    [reply, setReply] = useState<string | null>(null),
    [notifications, setNotifications] = useState<Notification[]>([]);
  const [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [postCategory, setPostCategory] = useState("general"),
    [link, setLink] = useState(""),
    [postId, setPostId] = useState(""),
    [saving, setSaving] = useState(false);
  const [username, setUsername] = useState(initial.user?.username || ""),
    [display, setDisplay] = useState(initial.user?.display_name || ""),
    [bio, setBio] = useState(initial.user?.bio || ""),
    [accept, setAccept] = useState(false);
  const [attachments, setAttachments] = useState<Media[]>([]),
    [uploading, setUploading] = useState(false),
    [progress, setProgress] = useState(0),
    [lightbox, setLightbox] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<{
      type: string;
      id: string;
    } | null>(null),
    [reportReason, setReportReason] = useState("Spam"),
    [reportDetails, setReportDetails] = useState(""),
    [deleting, setDeleting] = useState<{ type: string; id: string } | null>(
      null,
    ),
    [editing, setEditing] = useState<{ type: string; id: string } | null>(null),
    [editTitle, setEditTitle] = useState(""),
    [editBody, setEditBody] = useState(""),
    [editLink, setEditLink] = useState("");
  const [sampleCommunity, setSampleCommunity] = useState<string | null>(null);
  const feedRequest = useRef(0);
  const user = boot.user,
    selected = boot.categories.find((c) => c.slug === category);
  async function reload(offset = 0) {
    const requestId = ++feedRequest.current;
    setBusy(true);
    setError("");
    try {
      const p = new URLSearchParams({
        sort,
        q: search,
        category,
        filter,
        author,
        offset: String(offset),
      });
      const r = await api("posts?" + p);
      if (requestId !== feedRequest.current) return;
      setPosts((old) => (offset ? [...old, ...r.posts] : r.posts));
      setNext(r.nextOffset);
    } catch (e) {
      if (requestId === feedRequest.current) { setError((e as Error).message); setPosts([]); setDetail(null); setComments([]); }
    } finally {
      if (requestId === feedRequest.current) setBusy(false);
    }
  }
  async function refreshBoot() {
    const b = await api("bootstrap");
    setBoot(b);
    return b;
  }
  useEffect(() => {
    void reload();
  }, [category, filter, sort, search, author]);
  useEffect(() => {
    const params = new URLSearchParams(location.search),
      id = params.get("post"),
      member = params.get("member"),
      policy = params.get("page");
    if (id) void openPost(id);
    else if (member) void showProfile(member);
    else if (policy && (POLICIES[policy] || policy === "contact"))
      setModal(policy);
  }, []);
  function needUser() {
    if (!user) {
      location.href = boot.signInUrl;
      return false;
    }
    if (!user.onboarded) {
      setModal("profile");
      return false;
    }
    return true;
  }
  async function action(path: string, data: unknown) {
    try {
      return await api(path, data);
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    }
  }
  function compose() {
    if (!needUser()) return;
    try {
      const draft = JSON.parse(
        localStorage.getItem("forum-draft:" + user?.id) || "{}",
      );
      setAttachments(draft.attachments || []);
      setTitle(draft.title || "");
      setBody(draft.body || "");
      setLink(draft.link || "");
      setPostCategory(category || draft.category || "general");
      setPostId(draft.id || crypto.randomUUID());
    } catch {
      setPostId(crypto.randomUUID());
    }
    setModal("compose");
  }
  useEffect(() => {
    if (modal === "compose" && user)
      localStorage.setItem(
        "forum-draft:" + user.id,
        JSON.stringify({
          id: postId,
          title,
          body,
          link,
          category: postCategory,
          attachments,
        }),
      );
  }, [title, body, link, postCategory, postId, modal, user, attachments]);
  async function publish(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const r = await action("posts", {
      id: postId,
      title,
      body,
      category: postCategory,
      link_url: link,
      media_ids: attachments.map((m) => m.id),
    });
    setSaving(false);
    if (r) {
      localStorage.removeItem("forum-draft:" + user?.id);
      setAttachments([]);
      setModal("");
      toast.success("Your post is live.");
      void reload();
      void refreshBoot();
      void openPost(r.id);
    }
  }
  async function openPost(id: string) {
    try {
      id = validId(id);
      const r = await api("posts/" + id);
      setDetail(r.post);
      setComments(r.comments);
      setCommentsNext(r.nextOffset);
      setModal("post");
      if (detail?.id !== id) {
        setReply(null);
        setComment("");
        setCommentMedia([]);
        setCommentId(crypto.randomUUID());
      }
      history.replaceState(null, "", "?post=" + encodeURIComponent(id));
      if (user) void action("read", { post_id: id });
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    }
  }
  async function showProfile(name: string) {
    try {
      setProfile(
        (await api("profile/" + encodeURIComponent(name.toLowerCase())))
          .profile,
      );
      setModal("member");
      history.replaceState(
        null,
        "",
        "?member=" + encodeURIComponent(name.toLowerCase()),
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  function close() {
    setModal("");
    history.replaceState(null, "", "/");
  }
  function navigate(c = "", f = "") {
    if (c.startsWith("r-")) { location.assign("/?room=" + encodeURIComponent(c)); return; }
    setAuthor("");
    setCategory(c);
    setFilter(f);
    setMenu(false);
    setSearch("");
    setQuery("");
  }
  async function vote(p: Post, v: number) {
    if (!needUser()) return;
    const r = await action("vote", {
      post_id: p.id,
      value: p.my_vote === v ? 0 : v,
    });
    if (r) {
      setPosts((old) =>
        old.map((x) =>
          x.id === p.id
            ? {
                ...x,
                score: r.score,
                my_vote: r.my_vote ?? (p.my_vote === v ? 0 : v),
              }
            : x,
        ),
      );
      if (detail?.id === p.id)
        setDetail({
          ...detail,
          score: r.score,
          my_vote: p.my_vote === v ? 0 : v,
        });
    }
  }
  async function save(p: Post) {
    if (!needUser()) return;
    const r = await action("bookmark", { post_id: p.id, enabled: !p.saved });
    if (r) {
      setPosts((old) =>
        old.map((x) => (x.id === p.id ? { ...x, saved: p.saved ? 0 : 1 } : x)),
      );
      if (detail?.id === p.id) setDetail({ ...detail, saved: p.saved ? 0 : 1 });
      toast.success(p.saved ? "Removed from saved posts." : "Post saved.");
    }
  }
  async function share(p: Post) {
    try {
      await navigator.clipboard.writeText(location.origin + "/?post=" + p.id);
      toast.success("Link copied.");
    } catch {
      toast.error("Copy this link from the address bar.");
      void openPost(p.id);
    }
  }
  async function inbox() {
    if (!needUser()) return;
    try {
      const r = await api("notifications");
      setNotifications(r.notifications);
      setModal("notifications");
      await action("read-notifications", {});
      void refreshBoot();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function preference(kind: string, target: string, enabled: boolean) {
    if (!needUser()) return;
    const result = await action("preference", { kind, target, enabled });
    if (result) {
      await refreshBoot();
      void reload();
      if (detail) void openPost(detail.id);
      toast.success(enabled ? "Preference saved." : "Preference removed.");
    }
  }
  function report(type: string, id: string) {
    if (!needUser()) return;
    setReportTarget({ type, id });
    setReportReason("Spam");
    setReportDetails("");
  }
  function startEdit(type: string, item: Post | Comment) {
    setEditing({ type, id: item.id });
    setEditBody(item.body);
    setEditTitle("title" in item ? item.title : "");
    setEditLink("link_url" in item ? item.link_url || "" : "");
  }
  async function addFiles(files: FileList | null) {
    if (!files) return;
    if (files.length + attachments.length > 6) {
      toast.error("Attach up to six files.");
      return;
    }
    setUploading(true);
    try {
      let hasVideo = attachments.some((m) => m.kind === "video");
      for (const file of Array.from(files)) {
        setProgress(0);
        let m: Media;
        if (file.type.startsWith("video/")) {
          if (hasVideo) throw new Error("Attach one video per post.");
          if (file.size > 25 * 1048576)
            throw new Error("Videos must be 25 MB or smaller.");
          const poster = await videoThumbnail(file);
          m = await uploadFile(file, setProgress);
          setAttachments((old) => [...old, m]);
          hasVideo = true;
          try {
            const thumb = await uploadFile(poster, () => {});
            const r = await action("thumbnail", {
              video_id: m.id,
              thumbnail_id: thumb.id,
            });
            if (r) {
              m = { ...m, thumbnail_id: thumb.id, thumbnail_url: thumb.url };
              setAttachments((old) => old.map((x) => (x.id === m.id ? m : x)));
            }
          } catch {
            toast.error("Video uploaded without a thumbnail.");
          }
        } else {
          m = await uploadFile(await preparePicture(file), setProgress);
          setAttachments((old) => [...old, m]);
        }
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  useForumTools({
    search: async (q, c) => {
      const result = await api(
        "posts?" + new URLSearchParams({ q, category: c }),
      );
      setAuthor("");
      setFilter("");
      setCategory(c);
      setQuery(q);
      setSearch(q);
      close();
      return result.posts.map((p: Post) => ({
        id: p.id,
        title: p.title,
        category: p.category,
      }));
    },
    open: async (id) => {
      if (!(await openPost(id))) throw new Error("Discussion unavailable.");
      return { opened: id };
    },
    draft: async (t, b, c) => {
      if (!user?.onboarded)
        throw new Error("Sign in and finish your profile first.");
      if (!boot.categories.some((category) => category.slug === c))
        throw new Error("Choose an existing community.");
      const existing = localStorage.getItem("forum-draft:" + user.id);
      if (existing) {
        const saved = JSON.parse(existing);
        if (saved.title || saved.body || saved.attachments?.length)
          throw new Error(
            "A draft already exists. Open it in the composer first.",
          );
      }
      setAttachments([]);
      setTitle(t);
      setBody(b);
      setLink("");
      setPostCategory(c);
      setPostId(crypto.randomUUID());
      setModal("compose");
      return { status: "Draft ready for review. It has not been published." };
    },
  });
  function card(p: Post, expanded = false) {
    return (
      <article
        className={"post-card " + (expanded ? "expanded" : "")}
        key={p.id}
      >
        <div className="vote-rail">
          <button
            aria-label="Upvote"
            aria-pressed={p.my_vote === 1}
            onClick={() => vote(p, 1)}
            className={p.my_vote === 1 ? "voted" : ""}
          >
            <ArrowUp size={21} />
          </button>
          <strong>{p.score}</strong>
          <button
            aria-label="Downvote"
            aria-pressed={p.my_vote === -1}
            onClick={() => vote(p, -1)}
            className={p.my_vote === -1 ? "voted" : ""}
          >
            <ArrowDown size={21} />
          </button>
        </div>
        <div className="post-content">
          <div className="post-meta">
            <button
              className="category-tag"
              style={{ color: p.category_color }}
              onClick={() => {
                close();
                navigate(p.category);
              }}
            >
              f/{p.category}
            </button>
            <span>·</span>
            <button
              onClick={() => {
                void showProfile(p.username);
              }}
            >
              u/{p.username}
            </button>
            <span>
              · {ago(p.created_at)} ago{p.edited_at ? " · edited" : ""}
            </span>
            {p.pinned === 1 && (
              <span className="pinned">
                <Pin size={12} /> Pinned
              </span>
            )}
          </div>
          <h2>
            <button onClick={() => openPost(p.id)}>{p.title}</button>
          </h2>
          {expanded ? (
            <RichText text={p.body} />
          ) : (
            <p className="post-excerpt">{p.body}</p>
          )}
          {p.media.length > 0 && (
            <div className="post-media">
              {p.media.map((m) =>
                m.kind === "video" ? (
                  <video
                    key={m.id}
                    src={m.url}
                    controls
                    preload="metadata"
                    poster={m.thumbnail_url || undefined}
                  />
                ) : (
                  <button
                    key={m.id}
                    className="image-open"
                    aria-label="Enlarge picture"
                    onClick={() => setLightbox(m.url)}
                  >
                    <img
                      src={m.url}
                      alt="Community post attachment"
                      loading="lazy"
                    />
                  </button>
                ),
              )}
            </div>
          )}
          {p.link_url && expanded && <VideoEmbed url={p.link_url} />}
          {p.link_url && (
            <a
              className="post-link"
              href={p.link_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {p.link_url}
            </a>
          )}
          <div className="post-actions">
            <button onClick={() => openPost(p.id)}>
              <MessageSquare size={16} />
              {p.comment_count} comments
            </button>
            <button onClick={() => share(p)}>
              <Share2 size={16} />
              Share
            </button>
            <button onClick={() => save(p)} aria-pressed={!!p.saved}>
              <Bookmark size={16} fill={p.saved ? "currentColor" : "none"} />
              {p.saved ? "Saved" : "Save"}
            </button>
            {p.locked === 1 && <span>Locked</span>}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button aria-label="More post actions">
                  <MoreHorizontal size={17} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => preference("follow_post", p.id, !p.followed)}
                >
                  {p.followed ? "Unfollow discussion" : "Follow discussion"}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => report("post", p.id)}>
                  Report post
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => preference("mute_post", p.id, true)}
                >
                  Mute discussion
                </DropdownMenuItem>
                {p.user_id !== user?.id && (
                  <DropdownMenuItem
                    onSelect={() => preference("mute_user", p.user_id, true)}
                  >
                    Mute u/{p.username}
                  </DropdownMenuItem>
                )}
                {p.user_id === user?.id && (
                  <>
                    <DropdownMenuItem onSelect={() => startEdit("post", p)}>
                      Edit post
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => setDeleting({ type: "post", id: p.id })}
                    >
                      Delete post
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </article>
    );
  }
  return (
    <>
      <a className="skip-link" href="#feed">
        Skip to discussions
      </a>
      <header className="topbar">
        <div className="brand">
          <button
            className="mobile-menu icon-button"
            aria-label="Open navigation"
            onClick={() => setMenu(!menu)}
          >
            <Menu />
          </button>
          <a href="/" aria-label="FreeSpeech home">
            <img src="/favicon.svg" alt="" />
            <span>
              free<span className="brand-orange">speech</span>
            </span>
          </a>
        </div>
        <form
          className="search-box"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(query);
          }}
        >
          <Search size={19} />
          <input
            aria-label="Search communities and conversations"
            placeholder="Search communities and conversations"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery("");
                setSearch("");
              }}
            >
              <X size={16} />
            </button>
          )}
        </form>
        <div className="header-actions">

          <button
            className="icon-button notification-button"
            aria-label="Notifications"
            onClick={inbox}
          >
            <Bell size={21} />
            {boot.unread > 0 && <span>{boot.unread}</span>}
          </button>
          <Button asChild className="community-login-button">
            <a href={boot.signInUrl}>{user ? "Connect wallet" : "Login / Connect wallet"}</a>
          </Button>
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="avatar" aria-label="Account menu">
                  {user.avatar_id ? (
                    <img src={"/api/forum/media/" + user.avatar_id} alt="" />
                  ) : (
                    user.display_name[0]
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setModal("profile")}>
                  <Settings size={16} />
                  Profile & settings
                </DropdownMenuItem>
                {["admin", "moderator"].includes(user.role) && (
                  <DropdownMenuItem
                    onSelect={async () => {
                      await refreshBoot();
                      setModal("staff");
                    }}
                  >
                    Staff tools
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onSelect={() => (location.href = boot.signOutUrl)}
                >
                  <LogOut size={16} />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </header>
      <SidebarProvider className="forum-shell">
        <div className="forum-layout">
          <Sidebar
            collapsible="none"
            className={"left-nav " + (menu ? "is-open" : "")}
          >
            <nav aria-label="Main navigation">
              <button
                className={
                  !category && !filter ? "nav-item active" : "nav-item"
                }
                onClick={() => navigate()}
              >
                <Home size={19} />
                Home
              </button>
              <button
                className={
                  filter === "following" ? "nav-item active" : "nav-item"
                }
                onClick={() => {
                  if (needUser()) navigate("", "following");
                }}
              >
                <Users size={19} />
                My communities
              </button>
              <a className="nav-item" href="/#communities"><Flame size={19} />Trending Communities</a>
              <a className="nav-item" href="/?create=1"><Plus size={19} />Start a Community</a>
              <div className="nav-divider" />
              <h3>EXPLORE TOPICS</h3>
              <button className={!category && !filter ? "nav-item active" : "nav-item"} onClick={() => navigate()}><img className="community-nav-logo" src="/favicon.svg" alt="" /><span>FreeSpeech</span></button>
              {["Memecoins", "Politics", "Gaming", "AI & Tech", "Culture", "Huzz", "Racism"].map((topic) => (
                <details className="topic-dropdown" key={topic}>
                  <summary><span>{topic}</span><ChevronRight size={16} /></summary>
                  <div className="topic-communities">
                    {topic === "Memecoins" ? communityExamples.map(name => <button key={name} className="nav-item" onClick={() => { setSampleCommunity(name); setMenu(false); }}><img className="community-nav-logo" src={"/communities/" + name.toLowerCase() + ".svg"} alt="" /><span>{name}</span></button>) : <p>No communities yet.</p>}
                    <a className="topic-create-link" href="/?create=1"><Plus size={14} />Start a community</a>
                  </div>
                </details>
              ))}
              <div className="nav-divider" />
              <h3>FREESPEECH</h3>
              {[
                ["about", "About the community"],
                ["rules", "Community guidelines"],
                ["moderation", "How moderation works"],
                ["contact", "Contact & appeals"],
              ].map(([key, label]) => (
                <button
                  className="nav-link"
                  key={key}
                  onClick={() => {
                    if (key === "contact" && !user) {
                      location.href = boot.signInUrl;
                      return;
                    }
                    setModal(key);
                  }}
                >
                  {label}
                </button>
              ))}
            </nav>
            <div className="nav-footer">
              <span>
                More perspectives.
                <br />
                Better conversations.
              </span>
              <div>
                <button onClick={() => setModal("privacy")}>Privacy</button>
                <button onClick={() => setModal("terms")}>Terms</button>
              </div>
              <small>© {new Date().getFullYear()} FreeSpeech</small>
            </div>
          </Sidebar>
          <main id="feed" className="feed">
            {user && isRestricted(user) && (
              <div className="restriction-banner">
                <strong>Your account is restricted.</strong>
                <p>{user.restriction_reason}</p>
                <button onClick={() => setModal("contact")}>
                  Contact staff or appeal
                </button>
              </div>
            )}
            {!search && !selected && !author && !["saved", "following", "unread"].includes(filter) ? (
              <section className="community-launch-banner" aria-label="Launch or join a community">
                <img className="community-launch-art" src="/community-launch-banner.svg" alt="" />
                <div className="community-launch-copy">
                  <span className="launch-banner-eyebrow">A COIN. A COMMUNITY. YOUR PEOPLE.</span>
                  <h1>Launch a coin.<br />Build your community.</h1>
                  <p>Already holding? Verify your tokens and find your people.</p>
                  <div className="community-launch-actions">
                    <a className="launch-banner-primary" href="/?create=1">Launch a coin <Plus size={16} /></a>
                    <a className="launch-banner-secondary" href="/#communities">Verify & join <ChevronRight size={16} /></a>
                  </div>
                </div>
              </section>
            ) : (<div className="feed-heading">
              <div>
                <div className="eyebrow">YOUR SPACE TO SPEAK</div>
                <h1>
                  {search
                    ? "Search results"
                    : selected?.name ||
                      (author
                        ? "Posts by u/" + author
                        : filter === "saved"
                          ? "Saved posts"
                          : filter === "following"
                            ? "My communities"
                            : filter === "unread"
                              ? "Unread discussions"
                              : "The conversation starts here.")}
                </h1>
                <p>
                  {search
                    ? "Results for “" + search + "”"
                    : selected?.description ||
                      "Different ideas. Open minds. A place for everyone."}
                </p>
              </div>
            </div>
            )}
            {selected && (
              <div className="category-controls">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    preference("join_category", selected.slug, !selected.joined)
                  }
                >
                  {selected.joined ? "Leave community" : "Join community"}
                </Button>
                <button
                  onClick={() =>
                    preference("mute_category", selected.slug, true)
                  }
                >
                  Mute community
                </button>
              </div>
            )}
            <div className="composer-prompt">
              <span className="avatar subtle">
                {user?.display_name[0] || <MessageSquare size={20} />}
              </span>
              <button onClick={compose}>What’s on your mind?</button>
              <button
                className="icon-button"
                aria-label="Create a post with a picture"
                onClick={compose}
              >
                <ImageIcon size={21} />
              </button>
            </div>
            <div className="feed-toolbar">
              <Tabs value={sort} onValueChange={setSort}>
                <TabsList>
                  <TabsTrigger value="hot">
                    <Flame size={16} />
                    Hot
                  </TabsTrigger>
                  <TabsTrigger value="new">
                    <Clock size={16} />
                    New
                  </TabsTrigger>
                  <TabsTrigger value="top">
                    <ArrowUp size={16} />
                    Top
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <span>{selected ? "f/" + selected.slug : "All communities"}</span>
            </div>
            {error && (
              <div className="empty-state" role="alert">
                <p>{error}</p>
                <Button onClick={() => reload()}>Try again</Button>
              </div>
            )}
            <div aria-busy={busy}>{posts.map((p) => card(p))}</div>
            {!posts.length && !busy && !error && (
              <div className="empty-state">
                <MessageSquare />
                <h2>No conversations here yet.</h2>
                <p>Start one with a question or an idea.</p>
                <Button onClick={compose}>Create a post</Button>
              </div>
            )}
            {busy && (
              <p className="loading" role="status">
                Loading conversations…
              </p>
            )}
            {next !== null && !busy && (
              <Button
                variant="outline"
                className="load-more"
                onClick={() => reload(next)}
              >
                More conversations
              </Button>
            )}
          </main>
          <aside className="right-sidebar">
            <section className="member-summary-card" aria-label="Your profile">
              <div className="member-summary-identity">
                <div className="member-summary-avatar">
                  {user?.avatar_id ? <img src={"/api/forum/media/" + user.avatar_id} alt={`${user.display_name} profile picture`} /> : user ? <span>{user.display_name.slice(0, 1).toUpperCase()}</span> : <UserRound size={28} />}
                </div>
                <div className="member-summary-name">
                  <h2>{user?.display_name || "Your profile"}</h2>
                  {user ? <p>@{user.username}</p> : <p>Your place in the community</p>}
                  {!!boot.profileStats?.created && <span className="founder-badge"><Crown size={12} /> Community founder</span>}
                </div>
              </div>
              <dl className="member-summary-stats">
                <div title="Upvotes received on your active posts, excluding your own votes"><dt>Upvotes</dt><dd>{boot.profileStats?.upvotes.toLocaleString() ?? "—"}</dd></div>
                <div title="Communities you created"><dt>Created</dt><dd>{boot.profileStats?.created.toLocaleString() ?? "—"}</dd></div>
                <div title="Communities you joined"><dt>Joined</dt><dd>{boot.profileStats?.joined.toLocaleString() ?? "—"}</dd></div>
              </dl>
              {user ? <Button variant="outline" className="full-width" onClick={() => setModal("profile")}>View your profile</Button> : <Button asChild className="full-width"><a href={boot.signInUrl}>Login / Connect wallet</a></Button>}
            </section>
            <section className="about-card">
              <div className="freespeech-token-banner">
                <img src="/favicon.svg" alt="FreeSpeech logo" />
                <div><strong>$FREESPEECH</strong><span>Your voice. Your community.</span></div>
              </div>
              <div className="sidebar-card-content">
                <h2>Welcome to $FREESPEECH</h2>
                <p>
                  A community for curious minds and honest conversations. Share
                  your perspective. Discover a new one.
                </p>
                <div className="token-community-stats" aria-label="Token statistics not connected">
                  <div><strong aria-label="Not available">—</strong><span>Market cap</span></div>
                  <div><strong aria-label="Not available">—</strong><span>Holders</span></div>
                </div>
                <p className="token-stats-note">Token data not connected yet</p>
                <div className="community-stats">
                  <div>
                    <strong>{boot.stats.posts.toLocaleString()}</strong>
                    <span>Posts</span>
                  </div>
                  <div>
                    <strong>{boot.stats.posts.toLocaleString()}</strong>
                    <span>Discussions</span>
                  </div>
                </div>
                <Button className="full-width" onClick={compose}>
                  Join the conversation
                </Button>
              </div>
            </section>
            <section className="sidebar-card">
              <h2>Community guidelines</h2>
              <ol className="rules-list">
                {RULES.slice(0, 4).map((r, i) => (
                  <li key={r.title}>
                    <span>{i + 1}</span>
                    {r.title}
                  </li>
                ))}
              </ol>
              <button className="orange-link" onClick={() => setModal("rules")}>
                Read the full guidelines <ChevronRight size={15} />
              </button>
            </section>
            <section className="small-note">
              <MessageSquare size={21} />
              <div>
                <strong>Have an idea for this place?</strong>
                <p>Help us build a better community.</p>
                <button onClick={() => navigate("feedback")}>
                  Visit f/feedback →
                </button>
              </div>
            </section>
          </aside>
        </div>
      </SidebarProvider>
      <Dialog open={!!sampleCommunity} onOpenChange={open => { if (!open) setSampleCommunity(null); }}>
        <DialogContent className="forum-dialog"><DialogHeader><DialogTitle>{sampleCommunity}</DialogTitle><DialogDescription>Sample community preview</DialogDescription></DialogHeader>
        {sampleCommunity && <div className="sample-community-preview"><img src={"/communities/" + sampleCommunity.toLowerCase() + ".svg"} alt={sampleCommunity + " sample logo"} /><p>This is an example community, not an official or live token room.</p><a href="/?create=1">Start a Community →</a></div>}</DialogContent>
      </Dialog>
      <Dialog
        open={!!modal}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent
          className={
            modal === "post" || modal === "staff"
              ? "forum-dialog discussion-dialog"
              : "forum-dialog"
          }
        >
          <DialogHeader>
            <DialogTitle>
              {modal === "compose"
                ? "Create a post"
                : modal === "profile"
                  ? user?.onboarded
                    ? "Your profile"
                    : "Make yourself at home"
                  : modal === "post"
                    ? "Discussion"
                    : modal === "notifications"
                      ? "Notifications"
                      : modal === "staff"
                        ? "Staff tools"
                        : modal === "contact"
                          ? "Contact & appeals"
                          : modal === "member"
                            ? profile?.display_name || "Member profile"
                            : POLICIES[modal]?.title || "FreeSpeech"}
            </DialogTitle>
            <DialogDescription>
              {modal === "compose"
                ? "A question, a perspective, or something worth sharing."
                : modal === "profile"
                  ? "Choose how you appear to the community. Your email stays private."
                  : modal === "post"
                    ? "Make room for a different perspective."
                    : modal === "notifications"
                      ? "Your replies, mentions, and followed discussions."
                      : POLICIES[modal]?.intro || ""}
            </DialogDescription>
          </DialogHeader>
          {modal === "member" && profile && (
            <div className="member-profile">
              {profile.avatar_id ? (
                <img
                  className="profile-picture"
                  src={"/api/forum/media/" + profile.avatar_id}
                  alt="Member avatar"
                />
              ) : (
                <span className="avatar">{profile.display_name[0]}</span>
              )}
              <h3>u/{profile.username}</h3>
              <RichText
                text={profile.bio || "This member has not added a bio."}
              />
              <p>Joined {new Date(profile.created_at).toLocaleDateString()}</p>
              <Button
                onClick={() => {
                  close();
                  setAuthor(profile.username);
                  setCategory("");
                  setFilter("author");
                  setSearch("");
                  setQuery("");
                }}
              >
                View posts
              </Button>
              {profile.id !== user?.id && (
                <div className="comment-actions">
                  <button
                    onClick={() => {
                      void preference("mute_user", profile.id, true);
                    }}
                  >
                    Mute member
                  </button>
                  <button onClick={() => report("user", profile.id)}>
                    Report account
                  </button>
                </div>
              )}
            </div>
          )}
          {modal === "contact" && <ContactPanel api={api} />}
          {modal === "staff" && (
            <StaffPanel boot={boot} api={api} onRefresh={refreshBoot} />
          )}
          {modal === "compose" && (
            <form className="forum-form" onSubmit={publish}>
              <label>
                Community
                <Select value={postCategory} onValueChange={setPostCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {boot.categories.map((c) => (
                      <SelectItem key={c.slug} value={c.slug}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label>
                Title
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  minLength={8}
                  maxLength={220}
                  required
                  placeholder="Give your conversation a title"
                />
              </label>
              <label>
                Your post
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  maxLength={20000}
                  rows={7}
                  placeholder="What would you like to say?"
                />
              </label>
              <label>
                Link (optional)
                <input
                  type="url"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://"
                />
              </label>
              <label className="upload-picker">
                Pictures or a short video
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,video/mp4"
                  multiple
                  disabled={uploading || attachments.length >= 6}
                  onChange={(e) => {
                    void addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <small>
                  Up to 6 attachments. One MP4, up to 25 MB and 2 minutes.
                </small>
              </label>
              {uploading && (
                <div role="status">
                  Uploading… {progress}%<progress value={progress} max={100} />
                </div>
              )}
              <div className="attachment-previews">
                {attachments.map((m) => (
                  <div key={m.id}>
                    {m.kind === "video" ? (
                      <video
                        src={m.url}
                        controls
                        poster={m.thumbnail_url || undefined}
                      />
                    ) : (
                      <img src={m.url} alt="Draft attachment" />
                    )}
                    <button
                      type="button"
                      aria-label="Remove attachment"
                      onClick={async () => {
                        const r = await action("delete-upload", { id: m.id });
                        if (r)
                          setAttachments((old) =>
                            old.filter((x) => x.id !== m.id),
                          );
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="form-footer">
                <small>Draft saved on this device.</small>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={uploading || saving}
                  onClick={() => {
                    const key = "forum-draft:" + user?.id;
                    const previous = localStorage.getItem(key);
                    localStorage.removeItem(key);
                    setModal("");
                    setAttachments([]);
                    toast.success("Draft discarded.", {
                      action: {
                        label: "Undo",
                        onClick: () => {
                          if (previous) localStorage.setItem(key, previous);
                          compose();
                        },
                      },
                    });
                  }}
                >
                  Discard draft
                </Button>
                <Button disabled={saving || uploading}>
                  {saving ? "Publishing…" : "Publish post"}
                </Button>
              </div>
            </form>
          )}
          {modal === "profile" && user && (
            <>
              <form
                className="forum-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setSaving(true);
                  const r = await action("profile", {
                    username,
                    display_name: display,
                    bio,
                    accept_rules: accept,
                  });
                  setSaving(false);
                  if (r) {
                    await refreshBoot();
                    setModal("");
                    toast.success("Profile saved.");
                  }
                }}
              >
                <label>
                  Profile picture
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={uploading || !user.onboarded}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setUploading(true);
                      try {
                        const media = await uploadFile(
                          await preparePicture(file),
                          setProgress,
                        );
                        const r = await action("profile", {
                          username,
                          display_name: display,
                          bio,
                          avatar_id: media.id,
                          accept_rules: accept,
                        });
                        if (r) {
                          await refreshBoot();
                          toast.success("Profile picture updated.");
                        }
                      } catch (e) {
                        toast.error((e as Error).message);
                      } finally {
                        setUploading(false);
                      }
                    }}
                  />
                </label>
                <label>
                  Username
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    minLength={3}
                    maxLength={24}
                  />
                </label>
                <label>
                  Display name
                  <input
                    value={display}
                    onChange={(e) => setDisplay(e.target.value)}
                    required
                    maxLength={50}
                  />
                </label>
                <label>
                  Bio
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    maxLength={400}
                    rows={3}
                  />
                </label>
                {!user.onboarded && (
                  <label className="checkbox-label">
                    <Checkbox
                      checked={accept}
                      onCheckedChange={(v) => setAccept(v === true)}
                    />
                    I am an adult and accept the community guidelines and terms.
                  </label>
                )}
                <Button disabled={saving}>Save profile</Button>
              </form>
              {user.onboarded && (
                <AccountControls
                  boot={boot}
                  api={api}
                  onRefresh={refreshBoot}
                />
              )}
            </>
          )}
          {modal === "post" && detail && (
            <div>
              {detail.status === "removed" && (
                <div className="restriction-banner">
                  <strong>This post was removed.</strong>
                  <p>{detail.removal_reason}</p>
                  <button onClick={() => setModal("contact")}>
                    Appeal this decision
                  </button>
                </div>
              )}
              {card(detail, true)}
              <section className="discussion-comments">
                <h3>{detail.comment_count} comments</h3>
                {!detail.locked && (
                  <form
                    className="forum-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!needUser()) return;
                      setSaving(true);
                      const r = await action("comments", {
                        id: commentId,
                        post_id: detail.id,
                        parent_id: reply,
                        body: comment,
                        media_ids: commentMedia.map((m) => m.id),
                      });
                      setSaving(false);
                      if (r) {
                        setCommentMedia([]);
                        setComment("");
                        setReply(null);
                        setCommentId(crypto.randomUUID());
                        void openPost(detail.id);
                        void reload();
                      }
                    }}
                  >
                    {reply && (
                      <button type="button" onClick={() => setReply(null)}>
                        Cancel reply
                      </button>
                    )}
                    <textarea
                      aria-label="Your comment"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={3}
                      maxLength={10000}
                      required={!commentMedia.length}
                      placeholder={
                        reply ? "Write your reply…" : "Add to the conversation…"
                      }
                    />
                    <label>
                      Attach pictures
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        disabled={uploading}
                        onChange={async (e) => {
                          const files = Array.from(e.target.files || []);
                          if (files.length + commentMedia.length > 6) {
                            toast.error("Attach up to six pictures.");
                            return;
                          }
                          setUploading(true);
                          try {
                            for (const file of files) {
                              const m = await uploadFile(
                                await preparePicture(file),
                                setProgress,
                              );
                              setCommentMedia((old) => [...old, m]);
                            }
                          } catch (e) {
                            toast.error((e as Error).message);
                          } finally {
                            setUploading(false);
                          }
                        }}
                      />
                    </label>
                    <div className="attachment-previews">
                      {commentMedia.map((m) => (
                        <div key={m.id}>
                          <img src={m.url} alt="Comment attachment" />
                          <button
                            type="button"
                            aria-label="Remove comment picture"
                            onClick={async () => {
                              if (await action("delete-upload", { id: m.id }))
                                setCommentMedia((old) =>
                                  old.filter((x) => x.id !== m.id),
                                );
                            }}
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <Button disabled={saving || uploading} className="self-end">
                      Comment
                    </Button>
                  </form>
                )}
                {threadComments(comments).map(({ comment: c, depth }) => (
                  <div
                    key={c.id}
                    id={"comment-" + c.id}
                    className={"comment " + (c.parent_id ? "reply" : "")}
                    style={{ marginLeft: Math.min(depth, 3) * 16 }}
                  >
                    <div className="post-meta">
                      <button onClick={() => showProfile(c.username)}>
                        <strong>u/{c.username}</strong>
                      </button>
                      <span>· {ago(c.created_at)} ago</span>
                      {c.parent_id && (
                        <a href={"#comment-" + c.parent_id}>
                          Reply to u/
                          {comments.find((parent) => parent.id === c.parent_id)
                            ?.username || "member"}
                        </a>
                      )}
                    </div>
                    <RichText
                      text={
                        c.status === "active" ? c.body : "Comment " + c.status
                      }
                    />
                    {c.media.map((m) => (
                      <button
                        className="comment-image"
                        key={m.id}
                        onClick={() => setLightbox(m.url)}
                        aria-label="Enlarge comment picture"
                      >
                        <img src={m.url} alt="Comment picture" />
                      </button>
                    ))}
                    {c.status === "active" && (
                      <div className="comment-actions">
                        <button
                          onClick={() => {
                            if (needUser()) setReply(c.id);
                          }}
                        >
                          Reply
                        </button>
                        <button
                          onClick={() => {
                            if (needUser()) {
                              setReply(c.id);
                              setComment(
                                "> " + c.body.replaceAll("\n", "\n> ") + "\n\n",
                              );
                            }
                          }}
                        >
                          Quote
                        </button>
                        <button onClick={() => report("comment", c.id)}>
                          Report
                        </button>
                        {c.user_id === user?.id && (
                          <>
                            <button onClick={() => startEdit("comment", c)}>
                              Edit
                            </button>
                            <button
                              onClick={() =>
                                setDeleting({ type: "comment", id: c.id })
                              }
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {commentsNext !== null && (
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        const r = await api(
                          "posts/" + detail.id + "?offset=" + commentsNext,
                        );
                        setComments((old) => [...old, ...r.comments]);
                        setCommentsNext(r.nextOffset);
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  >
                    Load more comments
                  </Button>
                )}
              </section>
            </div>
          )}
          {modal === "notifications" && (
            <div>
              {!notifications.length ? (
                <p className="empty-state">You’re all caught up.</p>
              ) : (
                notifications.map((n) => (
                  <button
                    className="notification-row"
                    key={n.id}
                    onClick={() => {
                      const p = new URL(
                        n.href,
                        location.origin,
                      ).searchParams.get("post");
                      if (p) void openPost(p);
                    }}
                  >
                    <span>{n.title}</span>
                    <small>{ago(n.created_at)} ago</small>
                  </button>
                ))
              )}
            </div>
          )}
          {POLICIES[modal] && (
            <div className="policy-content">
              {POLICIES[modal].sections.map((s) => (
                <section key={s.heading}>
                  <h3>{s.heading}</h3>
                  <p>{s.body}</p>
                </section>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!lightbox}
        onOpenChange={(o) => {
          if (!o) setLightbox(null);
        }}
      >
        <DialogContent className="lightbox-dialog">
          <DialogTitle>Picture</DialogTitle>
          <DialogDescription>
            Full picture from the discussion.
          </DialogDescription>
          {lightbox && <img src={lightbox} alt="Full discussion attachment" />}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!reportTarget}
        onOpenChange={(o) => {
          if (!o) setReportTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report content</DialogTitle>
            <DialogDescription>
              Tell staff which rule may have been broken. A report does not
              automatically remove content.
            </DialogDescription>
          </DialogHeader>
          <form
            className="forum-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              const r = await action("report", {
                target_type: reportTarget?.type,
                target_id: reportTarget?.id,
                reason: reportReason,
                details: reportDetails,
              });
              setSaving(false);
              if (r) {
                setReportTarget(null);
                toast.success("Report sent to staff.");
              }
            }}
          >
            <label>
              Reason
              <Select value={reportReason} onValueChange={setReportReason}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_REASONS.map((r) => (
                    <SelectItem value={r} key={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label>
              Details
              <textarea
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                rows={4}
                maxLength={3000}
              />
            </label>
            <Button disabled={saving}>Submit report</Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!editing}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {editing?.type}</DialogTitle>
            <DialogDescription>
              Your edit will be marked on the discussion.
            </DialogDescription>
          </DialogHeader>
          <form
            className="forum-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              const r = await action("edit-" + editing?.type, {
                id: editing?.id,
                title: editTitle,
                body: editBody,
                link_url: editLink,
              });
              setSaving(false);
              if (r) {
                setEditing(null);
                void reload();
                if (detail) void openPost(detail.id);
                toast.success("Changes saved.");
              }
            }}
          >
            {editing?.type === "post" && (
              <label>
                Title
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  minLength={8}
                  maxLength={220}
                  required
                />
              </label>
            )}
            <label>
              Text
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                rows={7}
                maxLength={editing?.type === "post" ? 20000 : 10000}
              />
            </label>
            {editing?.type === "post" && (
              <label>
                Link
                <input
                  type="url"
                  value={editLink}
                  onChange={(e) => setEditLink(e.target.value)}
                />
              </label>
            )}
            <Button disabled={saving}>Save changes</Button>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!deleting}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this {deleting?.type}?</AlertDialogTitle>
            <AlertDialogDescription>
              The text and attachments will be deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const target = deleting;
                if (!target) return;
                const r = await action("delete-" + target.type, {
                  id: target.id,
                });
                if (r) {
                  setDeleting(null);
                  void reload();
                  if (target.type === "post") close();
                  else if (detail) void openPost(detail.id);
                  toast.success("Deleted.");
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Toaster richColors position="bottom-right" />
    </>
  );
}
