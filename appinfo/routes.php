<?php

declare(strict_types=1);

return [
	'routes' => [
		['name' => 'checklist#getCard', 'url' => '/cards/{cardId}', 'verb' => 'GET'],
		['name' => 'checklist#createList', 'url' => '/cards/{cardId}/lists', 'verb' => 'POST'],
		['name' => 'checklist#updateList', 'url' => '/lists/{listId}', 'verb' => 'PUT'],
		['name' => 'checklist#deleteList', 'url' => '/lists/{listId}', 'verb' => 'DELETE'],
		['name' => 'checklist#createItem', 'url' => '/lists/{listId}/items', 'verb' => 'POST'],
		['name' => 'checklist#updateItem', 'url' => '/items/{itemId}', 'verb' => 'PUT'],
		['name' => 'checklist#deleteItem', 'url' => '/items/{itemId}', 'verb' => 'DELETE'],
		['name' => 'checklist#setAssignees', 'url' => '/items/{itemId}/assignees', 'verb' => 'PUT'],
		['name' => 'checklist#convertItem', 'url' => '/items/{itemId}/convert', 'verb' => 'POST'],
		['name' => 'checklist#reorderItems', 'url' => '/lists/{listId}/reorder', 'verb' => 'PUT'],
		['name' => 'checklist#reorderLists', 'url' => '/cards/{cardId}/reorder', 'verb' => 'PUT'],
		['name' => 'checklist#boardSummary', 'url' => '/boards/{boardId}/summary', 'verb' => 'GET'],
	],
];
