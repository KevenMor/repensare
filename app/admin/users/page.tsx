'use client'

import { useState, useEffect } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger 
} from '@/components/ui/dialog'
import { 
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { 
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { 
  Users, 
  UserPlus, 
  Search, 
  Filter, 
  MoreVertical, 
  Edit, 
  Trash2, 
  Eye, 
  Shield, 
  Mail, 
  Phone, 
  Building, 
  Calendar,
  CheckCircle,
  XCircle,
  AlertCircle,
  Download,
  RefreshCw,
  Plus,
  Settings,
  History,
  Users2
} from 'lucide-react'
import { Toaster, toast } from 'sonner'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useAuth } from '@/components/auth/AuthProvider'
import { authFetch } from '@/lib/api'
import { Checkbox } from '@/components/ui/checkbox'

interface User {
  id: string
  name: string
  email: string
  role: string
  permissions: string[]
  status: 'active' | 'inactive'
  createdAt: string
  updatedAt: string
  createdBy: string
  lastLogin?: string
  avatar?: string
}

const roles = [
  { id: 'admin', name: 'Administrador', description: 'Acesso total ao sistema' },
  { id: 'manager', name: 'Gerente', description: 'Gerencia equipes e processos' },
  { id: 'agent', name: 'Agente', description: 'Atendimento e operações' },
  { id: 'viewer', name: 'Visualizador', description: 'Apenas visualização' },
]

const permissions = [
  { id: 'users_manage', name: 'Gerenciar Usuários', description: 'Criar, editar e excluir usuários' },
  { id: 'sales_view', name: 'Visualizar Vendas', description: 'Ver relatórios de vendas' },
  { id: 'sales_manage', name: 'Gerenciar Vendas', description: 'Criar e editar vendas' },
  { id: 'leads_view', name: 'Visualizar Leads', description: 'Ver lista de leads' },
  { id: 'leads_manage', name: 'Gerenciar Leads', description: 'Criar e editar leads' },
  { id: 'chats_view', name: 'Visualizar Chats', description: 'Ver conversas de atendimento' },
  { id: 'chats_manage', name: 'Gerenciar Chats', description: 'Responder e gerenciar chats' },
  { id: 'reports_view', name: 'Visualizar Relatórios', description: 'Acessar relatórios do sistema' },
  { id: 'settings_manage', name: 'Gerenciar Configurações', description: 'Alterar configurações do sistema' },
]

const ROLE_PERMISSIONS = {
  admin: [
    'users_manage', 'sales_view', 'sales_manage',
    'leads_view', 'leads_manage', 'chats_view', 'chats_manage',
    'reports_view', 'settings_manage'
  ],
  manager: [
    'users_manage', 'sales_view', 'sales_manage',
    'leads_view', 'leads_manage', 'chats_view', 'chats_manage',
    'reports_view'
  ],
  agent: [
    'chats_view', 'chats_manage', 'leads_view', 'leads_manage'
  ],
  viewer: [
    'chats_view', 'leads_view', 'sales_view', 'reports_view'
  ]
}

export default function UsersPage() {
  const { user } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [filteredUsers, setFilteredUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditDrawer, setShowEditDrawer] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: '',
    status: 'active' as 'active' | 'inactive',
    permissions: [] as string[]
  })

  // Load users
  useEffect(() => {
    fetchUsers()
  }, [])

  // Filter users
  useEffect(() => {
    let filtered = users

    if (searchTerm) {
      filtered = filtered.filter(user => 
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(user => user.status === statusFilter)
    }

    setFilteredUsers(filtered)
  }, [users, searchTerm, statusFilter])

  const fetchUsers = async () => {
    try {
      setIsLoading(true)
      if (!user) throw new Error('Usuário não autenticado')
      const response = await authFetch('/api/admin/users', {}, user)
      if (!response.ok) throw new Error('Erro ao carregar usuários')
      const data = await response.json()
      setUsers(data.data?.data || data.data || [])
    } catch (error) {
      console.error('Erro ao carregar usuários:', error)
      toast.error('Erro ao carregar usuários')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateUser = async () => {
    try {
      setIsSubmitting(true)
      if (!user) throw new Error('Usuário não autenticado')
      const response = await authFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      }, user)
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Erro ao criar usuário')
      }
      toast.success('Usuário criado com sucesso!')
      setShowCreateModal(false)
      resetForm()
      fetchUsers()
    } catch (error) {
      console.error('Erro ao criar usuário:', error)
      toast.error(error instanceof Error ? error.message : 'Erro ao criar usuário')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUpdateUser = async () => {
    if (!selectedUser) return
    try {
      setIsSubmitting(true)
      if (!user) throw new Error('Usuário não autenticado')
      const response = await authFetch(`/api/admin/users/${selectedUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      }, user)
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Erro ao atualizar usuário')
      }
      toast.success('Usuário atualizado com sucesso!')
      setShowEditDrawer(false)
      setSelectedUser(null)
      resetForm()
      fetchUsers()
    } catch (error) {
      console.error('Erro ao atualizar usuário:', error)
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar usuário')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Tem certeza que deseja excluir este usuário?')) return
    try {
      if (!user) throw new Error('Usuário não autenticado')
      const response = await authFetch(`/api/admin/users/${userId}`, {
        method: 'DELETE'
      }, user)
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Erro ao excluir usuário')
      }
      toast.success('Usuário excluído com sucesso!')
      fetchUsers()
    } catch (error) {
      console.error('Erro ao excluir usuário:', error)
      toast.error(error instanceof Error ? error.message : 'Erro ao excluir usuário')
    }
  }

  const handleEditUser = (user: User) => {
    setSelectedUser(user)
    setFormData({
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      permissions: user.permissions
    })
    setShowEditDrawer(true)
  }

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      role: '',
      status: 'active',
      permissions: []
    })
  }

  const getRoleName = (roleId: string) => {
    const role = roles.find(r => r.id === roleId)
    return role?.name || roleId
  }

  // Handler para alterar permissões manualmente
  const handlePermissionToggle = (permId: string) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permId)
        ? prev.permissions.filter(p => p !== permId)
        : [...prev.permissions, permId]
    }))
  }

  return (
    <AppLayout>
      <Toaster richColors position="top-right" />
      
      <div className="space-y-8">
        {/* Header Moderno */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 md:gap-0 py-6 px-2 border-b border-gray-100 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 rounded-xl shadow-sm">
          <div className="flex items-center gap-4">
            <div className="bg-blue-100 dark:bg-blue-900 p-3 rounded-xl">
              <Users2 className="w-8 h-8 text-blue-600 dark:text-blue-300" />
            </div>
            <div>
              <h1 className="text-4xl font-extrabold text-gray-900 dark:text-gray-100 tracking-tight">Gestão de Usuários</h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1 text-base">Gerencie usuários e permissões do sistema</p>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 md:mt-0">
            <Button
              variant="outline"
              onClick={fetchUsers}
              disabled={isLoading}
              className="rounded-lg border-gray-300 dark:border-gray-700 shadow-sm hover:shadow-md"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
              <DialogTrigger asChild>
                <Button onClick={() => resetForm()} className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-lg px-6 py-2">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Novo Usuário
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl rounded-2xl shadow-2xl bg-white dark:bg-gray-900 border-0">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-300 text-2xl font-bold">
                    <UserPlus className="w-6 h-6" />
                    Novo Usuário
                  </DialogTitle>
                </DialogHeader>
                <Tabs defaultValue="basic" className="w-full mt-2">
                  <TabsList className="grid w-full grid-cols-3 bg-gray-100 dark:bg-gray-800 rounded-lg mb-4">
                    <TabsTrigger value="basic" className="rounded-lg data-[state=active]:bg-blue-600 data-[state=active]:text-white">Informações</TabsTrigger>
                  </TabsList>
                  <TabsContent value="basic" className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1 block">Nome Completo</label>
                        <Input
                          className="rounded-lg border-gray-300 dark:border-gray-700 focus:ring-2 focus:ring-blue-500"
                          value={formData.name}
                          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="Digite o nome completo"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1 block">E-mail</label>
                        <Input
                          type="email"
                          className="rounded-lg border-gray-300 dark:border-gray-700 focus:ring-2 focus:ring-blue-500"
                          value={formData.email}
                          onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                          placeholder="usuario@empresa.com"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1 block">Cargo</label>
                        <Select value={formData.role} onValueChange={(value) => setFormData(prev => ({ ...prev, role: value }))}>
                          <SelectTrigger className="rounded-lg border-gray-300 dark:border-gray-700 focus:ring-2 focus:ring-blue-500">
                            <SelectValue placeholder="Selecione o cargo" />
                          </SelectTrigger>
                          <SelectContent className="rounded-lg">
                            {roles.map(role => (
                              <SelectItem key={role.id} value={role.id} className="rounded-lg">
                                {role.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2">
                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1 block">Permissões atribuídas</label>
                        <div className="flex flex-wrap gap-2">
                          {permissions.map((perm) => (
                            <label key={perm.id} className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded-lg cursor-pointer text-xs font-semibold">
                              <Checkbox
                                checked={formData.permissions.includes(perm.id)}
                                onChange={e => handlePermissionToggle(perm.id)}
                                className="w-4 h-4 border-gray-400"
                              />
                              {perm.name}
                            </label>
                          ))}
                          {permissions.length === 0 && (
                            <span className="text-gray-400 text-xs">Selecione um cargo para ver as permissões</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1 block">Status</label>
                        <Select value={formData.status} onValueChange={(value: 'active' | 'inactive') => setFormData(prev => ({ ...prev, status: value }))}>
                          <SelectTrigger className="rounded-lg border-gray-300 dark:border-gray-700 focus:ring-2 focus:ring-blue-500">
                            <SelectValue placeholder="Status do usuário" />
                          </SelectTrigger>
                          <SelectContent className="rounded-lg">
                            <SelectItem value="active" className="rounded-lg">Ativo</SelectItem>
                            <SelectItem value="inactive" className="rounded-lg">Inativo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
                <div className="flex justify-end gap-2 mt-6">
                  <Button variant="ghost" onClick={() => setShowCreateModal(false)} className="rounded-lg px-6 py-2 text-gray-600 dark:text-gray-300">Cancelar</Button>
                  <Button onClick={handleCreateUser} disabled={isSubmitting} className="rounded-lg px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-md">
                    {isSubmitting ? 'Criando...' : 'Criar Usuário'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Buscar</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Nome ou email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium mb-2 block">Status</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="active">Ativos</SelectItem>
                    <SelectItem value="inactive">Inativos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-end">
                <Button variant="outline" className="w-full">
                  <Download className="w-4 h-4 mr-2" />
                  Exportar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Users Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Usuários ({filteredUsers.length})</span>
              <Badge variant="secondary">
                {users.filter(u => u.status === 'active').length} ativos
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                <span className="ml-2">Carregando usuários...</span>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Cargo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead>Último acesso</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="w-8 h-8">
                            <AvatarImage src={user.avatar} />
                            <AvatarFallback>
                              {user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{user.name}</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">{user.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{getRoleName(user.role)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.status === 'active' ? 'default' : 'secondary'}>
                          {user.status === 'active' ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {format(new Date(user.createdAt), 'dd/MM/yyyy', { locale: ptBR })}
                        </span>
                      </TableCell>
                      <TableCell>
                        {user.lastLogin ? (
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {format(new Date(user.lastLogin), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">Nunca</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditUser(user)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteUser(user.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit User Drawer */}
      <Drawer open={showEditDrawer} onOpenChange={setShowEditDrawer}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              <Edit className="w-5 h-5" />
              Editar Usuário
            </DrawerTitle>
            <DrawerDescription>
              Atualize as informações do usuário {selectedUser?.name}
            </DrawerDescription>
          </DrawerHeader>
          
          <div className="px-4 py-6">
            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="basic">Informações</TabsTrigger>
              </TabsList>
              
              <TabsContent value="basic" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Nome Completo</label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Digite o nome completo"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">E-mail</label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="usuario@empresa.com"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Cargo</label>
                    <Select value={formData.role} onValueChange={(value) => setFormData(prev => ({ ...prev, role: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o cargo" />
                      </SelectTrigger>
                      <SelectContent>
                        {roles.map(role => (
                          <SelectItem key={role.id} value={role.id}>
                            {role.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1 block">Permissões atribuídas</label>
                    <div className="flex flex-wrap gap-2">
                      {permissions.map((perm) => (
                        <label key={perm.id} className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded-lg cursor-pointer text-xs font-semibold">
                          <Checkbox
                            checked={formData.permissions.includes(perm.id)}
                            onChange={e => handlePermissionToggle(perm.id)}
                            className="w-4 h-4 border-gray-400"
                          />
                          {perm.name}
                        </label>
                      ))}
                      {permissions.length === 0 && (
                        <span className="text-gray-400 text-xs">Selecione um cargo para ver as permissões</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Status</label>
                    <Select value={formData.status} onValueChange={(value: 'active' | 'inactive') => setFormData(prev => ({ ...prev, status: value }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Ativo</SelectItem>
                        <SelectItem value="inactive">Inativo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
          
          <DrawerFooter>
            <Button
              onClick={handleUpdateUser}
              disabled={isSubmitting || !formData.name || !formData.email || !formData.role}
              className="w-full"
            >
              {isSubmitting ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
            <DrawerClose asChild>
              <Button variant="outline" className="w-full">Cancelar</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </AppLayout>
  )
} 