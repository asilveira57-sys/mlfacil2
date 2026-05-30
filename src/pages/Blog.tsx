import { useState, useEffect } from 'react';
import { Link, useParams, useLocation } from 'react-router-dom';
import { useBlog } from '@/hooks/useBlog';
import { BlogPostCard } from '@/components/blog/public/BlogPostCard';
import { BlogPostContent } from '@/components/blog/public/BlogPostContent';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { BlogPost, BlogCategory } from '@/types/blog';

// SEO Head component — injeta title, meta, OG e JSON-LD Article
const SITE_URL = 'https://www.mktpfacil.com';

function setMeta(selector: string, attr: 'name' | 'property', key: string, content: string) {
  let el = document.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setLink(rel: string, href: string) {
  let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function setJsonLd(id: string, payload: object | null) {
  let el = document.getElementById(id) as HTMLScriptElement | null;
  if (payload === null) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = id;
    document.head.appendChild(el);
  }
  el.text = JSON.stringify(payload);
}

function BlogSEO({ post, category }: { post?: BlogPost | null; category?: BlogCategory | null }) {
  useEffect(() => {
    if (post) {
      const url = post.canonical_url || `${SITE_URL}/blog/${post.slug}`;
      const title = post.meta_title || post.titulo;
      const desc = post.meta_description || post.resumo || '';
      document.title = title;
      setMeta('meta[name="description"]', 'name', 'description', desc);
      if (post.meta_keywords) setMeta('meta[name="keywords"]', 'name', 'keywords', post.meta_keywords);
      setMeta('meta[property="og:title"]', 'property', 'og:title', title);
      setMeta('meta[property="og:description"]', 'property', 'og:description', desc);
      setMeta('meta[property="og:type"]', 'property', 'og:type', 'article');
      setMeta('meta[property="og:url"]', 'property', 'og:url', url);
      if (post.imagem_capa) setMeta('meta[property="og:image"]', 'property', 'og:image', post.imagem_capa);
      setLink('canonical', url);
      setJsonLd('jsonld-article', {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: title,
        description: desc,
        image: post.imagem_capa || undefined,
        datePublished: post.data_publicacao || post.created_at,
        dateModified: post.updated_at,
        author: post.autor ? { '@type': 'Person', name: post.autor } : undefined,
        publisher: { '@type': 'Organization', name: 'MKTP Fácil' },
        mainEntityOfPage: url,
      });
    } else if (category) {
      document.title = `${category.nome} — Blog MKTP Fácil`;
      setMeta('meta[name="description"]', 'name', 'description', category.descricao || `Posts da categoria ${category.nome}`);
      setLink('canonical', `${SITE_URL}/blog/categoria/${category.slug}`);
      setJsonLd('jsonld-article', null);
    } else {
      document.title = 'Blog — MKTP Fácil';
      setMeta('meta[name="description"]', 'name', 'description', 'Dicas, estratégias e novidades sobre vendas no Mercado Livre.');
      setLink('canonical', `${SITE_URL}/blog`);
      setJsonLd('jsonld-article', null);
    }
    return () => { document.title = 'MKTP Fácil'; };
  }, [post, category]);
  return null;
}


// Blog List Page
function BlogListPage() {
  const { fetchPublishedPosts, fetchCategories, loading } = useBlog();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [categories, setCategories] = useState<BlogCategory[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [postsData, categoriesData] = await Promise.all([
      fetchPublishedPosts(),
      fetchCategories()
    ]);
    setPosts(postsData);
    setCategories(categoriesData);
  };

  if (loading && posts.length === 0) {
    return (
      <div className="container mx-auto py-12 px-4 max-w-6xl">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-[400px] rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <BlogSEO />
      <div className="container mx-auto py-12 px-4 max-w-6xl">
        {/* Header */}
        <header className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Blog</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Dicas, estratégias e novidades sobre vendas no Mercado Livre
          </p>
        </header>

        {/* Categories */}
        {categories.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2 mb-12">
            <Link to="/blog">
              <Badge variant="secondary" className="text-sm px-4 py-1">
                Todos
              </Badge>
            </Link>
            {categories.map(cat => (
              <Link key={cat.id} to={`/blog/categoria/${cat.slug}`}>
                <Badge variant="outline" className="text-sm px-4 py-1 hover:bg-secondary">
                  {cat.nome}
                </Badge>
              </Link>
            ))}
          </div>
        )}

        {/* Posts Grid */}
        {posts.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground text-lg">
              Nenhum post publicado ainda.
            </p>
          </div>
        ) : (
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {posts.map(post => (
              <BlogPostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// Category Page
function BlogCategoryPage() {
  const { slug } = useParams();
  const { fetchPublishedPosts, fetchCategoryBySlug } = useBlog();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [category, setCategory] = useState<BlogCategory | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (slug) {
      loadData(slug);
    }
  }, [slug]);

  const loadData = async (categorySlug: string) => {
    setLoading(true);
    const [categoryData, postsData] = await Promise.all([
      fetchCategoryBySlug(categorySlug),
      fetchPublishedPosts({ categorySlug })
    ]);
    setCategory(categoryData);
    setPosts(postsData);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="container mx-auto py-12 px-4 max-w-6xl">
        <Skeleton className="h-12 w-64 mb-8" />
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-[400px] rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!category) {
    return (
      <div className="container mx-auto py-20 px-4 text-center">
        <h1 className="text-2xl font-bold mb-4">Categoria não encontrada</h1>
        <Link to="/blog" className="text-primary hover:underline">
          Voltar ao blog
        </Link>
      </div>
    );
  }

  return (
    <>
      <BlogSEO category={category} />
      <div className="container mx-auto py-12 px-4 max-w-6xl">
        <header className="mb-12">
          <Link to="/blog" className="text-sm text-muted-foreground hover:text-foreground mb-2 block">
            ← Voltar ao Blog
          </Link>
          <h1 className="text-4xl font-bold mb-2">{category.nome}</h1>
          {category.descricao && (
            <p className="text-xl text-muted-foreground">{category.descricao}</p>
          )}
        </header>

        {posts.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground text-lg">
              Nenhum post nesta categoria ainda.
            </p>
          </div>
        ) : (
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {posts.map(post => (
              <BlogPostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// Single Post Page
function BlogPostPage() {
  const { slug } = useParams();
  const { fetchPostBySlug } = useBlog();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (slug) {
      loadPost(slug);
    }
  }, [slug]);

  const loadPost = async (postSlug: string) => {
    setLoading(true);
    const data = await fetchPostBySlug(postSlug);
    if (data && data.status === 'publicado') {
      setPost(data);
    } else {
      setNotFound(true);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="container mx-auto py-12 px-4 max-w-4xl">
        <Skeleton className="h-8 w-32 mb-6" />
        <Skeleton className="h-16 w-full mb-4" />
        <Skeleton className="h-6 w-3/4 mb-8" />
        <Skeleton className="aspect-video w-full mb-8" />
        <div className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    );
  }

  if (notFound || !post) {
    return (
      <div className="container mx-auto py-20 px-4 text-center">
        <h1 className="text-2xl font-bold mb-4">Post não encontrado</h1>
        <Link to="/blog" className="text-primary hover:underline">
          Voltar ao blog
        </Link>
      </div>
    );
  }

  return (
    <>
      <BlogSEO post={post} />
      <div className="container mx-auto py-12 px-4">
        <BlogPostContent post={post} />
      </div>
    </>
  );
}

// Main Blog Component with routing
const Blog = () => {
  const { slug } = useParams();
  const loc = useLocation();
  
  // Determine which view to show based on path
  const isCategory = loc.pathname.includes('/blog/categoria/');
  const isPost = slug && !isCategory;

  if (isCategory) {
    return <BlogCategoryPage />;
  }
  
  if (isPost) {
    return <BlogPostPage />;
  }
  
  return <BlogListPage />;
};

export default Blog;
