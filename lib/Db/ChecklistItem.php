<?php

declare(strict_types=1);

namespace OCA\DeckChecklist\Db;

use OCP\AppFramework\Db\Entity;

/**
 * @method int getId()
 * @method int getListId()
 * @method void setListId(int $listId)
 * @method string getTitle()
 * @method void setTitle(string $title)
 * @method int getChecked()
 * @method void setChecked(int $checked)
 * @method int getSortOrder()
 * @method void setSortOrder(int $sortOrder)
 * @method string|null getDuedate()
 * @method void setDuedate(?string $duedate)
 */
class ChecklistItem extends Entity {
	protected ?int $listId = null;
	protected string $title = '';
	protected int $checked = 0;
	protected int $sortOrder = 0;
	protected ?string $duedate = null;

	public function __construct() {
		$this->addType('id', 'integer');
		$this->addType('listId', 'integer');
		$this->addType('checked', 'integer');
		$this->addType('sortOrder', 'integer');
	}
}
