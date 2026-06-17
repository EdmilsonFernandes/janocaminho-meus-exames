import polyglotI18nProvider from 'ra-i18n-polyglot';
import englishMessages from 'ra-language-english';

// Tradução pt-BR do react-admin. Parte do que não estiver aqui cai no inglês (base).
const ptMessages = {
  ...englishMessages,

  // ações / botões
  'ra.action.delete': 'Excluir',
  'ra.action.delete_item': 'Excluir',
  'ra.action.show': 'Ver',
  'ra.action.edit': 'Editar',
  'ra.action.create': 'Adicionar',
  'ra.action.save': 'Salvar',
  'ra.action.save_and_add': 'Salvar e adicionar outro',
  'ra.action.cancel': 'Cancelar',
  'ra.action.list': 'Voltar à lista',
  'ra.action.close': 'Fechar',
  'ra.action.confirm': 'Confirmar',
  'ra.action.unselect': 'Remover seleção',
  'ra.action.bulk_delete': 'Excluir selecionados',
  'ra.action.add_filter': 'Adicionar filtro',
  'ra.action.remove': 'Remover',
  'ra.action.export': 'Exportar',
  'ra.action.refresh': 'Atualizar',

  // mensagens / confirmação
  'ra.message.delete_title': 'Excluir %{name}',
  'ra.message.delete_content': 'Tem certeza que deseja excluir este registro?',
  'ra.message.are_you_sure': 'Tem certeza?',

  // notificações
  'ra.notification.updated': 'Registro atualizado',
  'ra.notification.created': 'Registro criado',
  'ra.notification.deleted': 'Registro excluído',
  'ra.notification.not_updated': 'Não foi possível atualizar',
  'ra.notification.not_created': 'Não foi possível criar',
  'ra.notification.not_deleted': 'Não foi possível excluir',
  'ra.notification.http_error': 'Erro de comunicação com o servidor',
  'ra.notification.item_doesnt_exist': 'Este registro não existe mais',

  // navegação / paginação
  'ra.navigation.no_results': 'Nenhum resultado encontrado',
  'ra.navigation.no_more_results': 'Não há mais resultados',
  'ra.navigation.page_out_of_boundaries': 'Página fora do intervalo',
  'ra.navigation.page_rows_per_page': 'Itens por página:',
  'ra.navigation.next': 'Próxima',
  'ra.navigation.prev': 'Anterior',
  'ra.navigation.skip_nav': 'Pular para o conteúdo',

  // páginas / títulos
  'ra.page.list': '%{name}',
  'ra.page.create': 'Adicionar %{name}',
  'ra.page.edit': 'Editar %{name}',
  'ra.page.show': 'Detalhes de %{name}',
  'ra.page.delete': 'Excluir %{name}',
  'ra.page.dashboard': 'Painel',
  'ra.page.error': 'Algo deu errado',
  'ra.page.loading': 'Carregando…',
  'ra.page.not_found': 'Não encontrado',
  'ra.page.empty': 'Ainda não há %{name}.',

  // boolean / misc
  'ra.boolean.true': 'Sim',
  'ra.boolean.false': 'Não',

  // inputs
  'ra.input.file.upload': 'Solte um arquivo aqui ou clique para selecionar',
  'ra.input.image.upload': 'Solte uma imagem aqui ou clique para selecionar',

  // consultas salvas
  'ra.saved_queries.label': 'Consultas salvas',
  'ra.saved_queries.placeholder': 'Adicionar consulta salva',
  'ra.saved_queries.help': 'Digite um nome e pressione Enter para salvar.',
  'ra.saved_queries.remove_label': 'Remover consulta salva',
};

export const i18nProvider = polyglotI18nProvider(() => ptMessages, 'pt');
