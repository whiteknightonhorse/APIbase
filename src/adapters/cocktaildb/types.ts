/** TheCocktailDB API raw response types (UC-304). */

export interface CocktailDbDrink {
  idDrink: string;
  strDrink: string;
  strCategory: string;
  strGlass: string;
  strInstructions: string;
  strDrinkThumb: string;
  strIngredient1: string | null;
  strIngredient2: string | null;
  strIngredient3: string | null;
  strIngredient4: string | null;
  strIngredient5: string | null;
  strIngredient6: string | null;
  strMeasure1: string | null;
  strMeasure2: string | null;
  strMeasure3: string | null;
  strMeasure4: string | null;
  strMeasure5: string | null;
  strMeasure6: string | null;
}

export interface CocktailSearchOutput {
  cocktails: {
    id: string;
    name: string;
    category: string;
    glass: string;
    instructions: string;
    image: string;
    ingredients: { name: string; measure: string }[];
  }[];
  count: number;
}
