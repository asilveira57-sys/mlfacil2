import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, FolderOpen, Sparkles, Globe } from 'lucide-react';
import { BlogPostList } from '@/components/blog/admin/BlogPostList';
import { BlogPostEditor } from '@/components/blog/admin/BlogPostEditor';
import { BlogCategoryManager } from '@/components/blog/admin/BlogCategoryManager';
import { BlogArticleGenerator } from '@/components/blog/admin/BlogArticleGenerator';
import { SiteContentManager } from '@/components/admin/SiteContentManager';

const BlogAdmin = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Determine active tab based on route
  const isCategories = location.pathname.includes('/admin/blog/categorias');
  const isGenerator = location.pathname.includes('/admin/blog/gerar');
  const isContent = location.pathname.includes('/admin/blog/conteudo');
  const isEditing = location.pathname.match(/\/admin\/blog\/(novo|[0-9a-f-]+)$/);
  
  const activeTab = isCategories ? 'categorias' : isGenerator ? 'gerar' : isContent ? 'conteudo' : 'posts';

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-6 px-4 max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Administração</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie blog, conteúdos e textos do site
          </p>
        </div>

        {/* Navigation Tabs (hide when editing) */}
        {!isEditing && (
          <Tabs value={activeTab} className="mb-6">
            <TabsList>
              <TabsTrigger 
                value="posts" 
                onClick={() => navigate('/admin/blog')}
                className="flex items-center gap-2"
              >
                <FileText className="h-4 w-4" />
                Posts
              </TabsTrigger>
              <TabsTrigger 
                value="categorias" 
                onClick={() => navigate('/admin/blog/categorias')}
                className="flex items-center gap-2"
              >
                <FolderOpen className="h-4 w-4" />
                Categorias
              </TabsTrigger>
              <TabsTrigger 
                value="gerar" 
                onClick={() => navigate('/admin/blog/gerar')}
                className="flex items-center gap-2"
              >
                <Sparkles className="h-4 w-4" />
                Gerar com IA
              </TabsTrigger>
              <TabsTrigger 
                value="conteudo" 
                onClick={() => navigate('/admin/blog/conteudo')}
                className="flex items-center gap-2"
              >
                <Globe className="h-4 w-4" />
                Conteúdo do Site
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {/* Content */}
        <Routes>
          <Route index element={<BlogPostList />} />
          <Route path="categorias" element={<BlogCategoryManager />} />
          <Route path="gerar" element={<BlogArticleGenerator />} />
          <Route path="conteudo" element={<SiteContentManager />} />
          <Route path=":id" element={<BlogPostEditor />} />
        </Routes>
      </div>
    </div>
  );
};

export default BlogAdmin;
